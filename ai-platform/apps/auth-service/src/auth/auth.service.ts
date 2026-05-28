import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@ai-platform/database';
import { LoggerService } from '@ai-platform/shared';
import { IGoogleProfile, ITokens } from '@ai-platform/shared';
import { IUser, IUserPayload } from '@ai-platform/shared';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const PASSWORD_HASH_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async googleLogin(profile: IGoogleProfile): Promise<ITokens> {
    this.logger.log('Google login processing started', AuthService.name);
    const user = await this.findOrCreateUser(profile);
    const tokens = await this.generateTokens(user);
    this.logger.log('Google login processing completed', AuthService.name, {
      userId: user.id,
    });

    return tokens;
  }

  async register(dto: RegisterDto): Promise<ITokens> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      this.logger.warn('Registration rejected: email already exists', AuthService.name, {
        email: dto.email,
      });
      throw new ConflictException('Email already exists');
    }

    const password = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password,
        name: dto.name,
      },
    });

    this.logger.log('User registered with email/password', AuthService.name, {
      userId: user.id,
    });

    return this.generateTokens(user as IUser);
  }

  async login(dto: LoginDto): Promise<ITokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user?.password) {
      this.logger.warn('Login rejected: invalid credentials', AuthService.name, {
        email: dto.email,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn('Login rejected: invalid credentials', AuthService.name, {
        userId: user.id,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log('User logged in with email/password', AuthService.name, {
      userId: user.id,
    });

    return this.generateTokens(user as IUser);
  }

  private async findOrCreateUser(profile: IGoogleProfile): Promise<IUser> {
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: profile.id }, { email: profile.email }],
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          googleId: profile.id,
          email: profile.email,
          name: profile.name,
          avatar: profile.avatar,
        },
      });
      this.logger.log('User created from Google profile', AuthService.name, {
        userId: user.id,
      });
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.id,
          avatar: profile.avatar ?? user.avatar,
        },
      });
      this.logger.log('Existing user linked to Google profile', AuthService.name, {
        userId: user.id,
      });
    } else {
      this.logger.log('Existing Google user found', AuthService.name, {
        userId: user.id,
      });
    }

    return user as IUser;
  }

  async generateTokens(user: IUser): Promise<ITokens> {
    const payload: IUserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      }),
    ]);

    await this.storeRefreshToken(user.id, refreshToken);
    this.logger.log('Auth tokens generated', AuthService.name, { userId: user.id });

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<ITokens> {
    this.logger.log('Refresh token validation started', AuthService.name);

    try {
      await this.jwtService.verifyAsync<IUserPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      this.logger.warn('Refresh token rejected: invalid signature', AuthService.name);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
        this.logger.warn(
          `Expired refresh token deleted for user ${stored.userId}`,
          AuthService.name,
        );
      } else {
        this.logger.warn('Refresh token rejected: token not found', AuthService.name);
      }

      throw new UnauthorizedException('Refresh token expired or not found');
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    this.logger.log('Refresh token rotated', AuthService.name, { userId: stored.userId });

    return this.generateTokens(stored.user as IUser);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    this.logger.log('User refresh tokens revoked', AuthService.name, { userId });
  }

  private async storeRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  }
}
