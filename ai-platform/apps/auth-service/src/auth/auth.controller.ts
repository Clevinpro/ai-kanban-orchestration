import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '@ai-platform/shared';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { IGoogleProfile, IUserPayload } from '@ai-platform/shared';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly logger: LoggerService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    this.logger.log('Google auth flow started', AuthController.name);
    // Passport redirects to Google automatically via GoogleAuthGuard
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res() res: Response): Promise<void> {
    this.logger.log('Register request received', AuthController.name);

    const { accessToken, refreshToken } = await this.authService.register(dto);

    res.cookie('accessToken', accessToken, { ...cookieBase, maxAge: FIFTEEN_MINUTES });
    res.cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: SEVEN_DAYS });

    this.logger.log('Register request completed', AuthController.name);
    res.json({ message: 'Registered' });
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res() res: Response): Promise<void> {
    this.logger.log('Login request received', AuthController.name);

    const { accessToken, refreshToken } = await this.authService.login(dto);

    res.cookie('accessToken', accessToken, { ...cookieBase, maxAge: FIFTEEN_MINUTES });
    res.cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: SEVEN_DAYS });

    this.logger.log('Login request completed', AuthController.name);
    res.json({ message: 'Logged in' });
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.logger.log('Google auth callback received', AuthController.name);

    const { accessToken, refreshToken } = await this.authService.googleLogin(
      req.user as IGoogleProfile,
    );

    res.cookie('accessToken', accessToken, { ...cookieBase, maxAge: FIFTEEN_MINUTES });
    res.cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: SEVEN_DAYS });

    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';
    this.logger.log('Google auth callback completed', AuthController.name);
    res.redirect(clientUrl);
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token: string | undefined = (req.cookies as Record<string, string>)['refreshToken'];
    if (!token) {
      this.logger.warn('Refresh token request rejected: missing token', AuthController.name);
      throw new UnauthorizedException('No refresh token provided');
    }

    this.logger.log('Refresh token request received', AuthController.name);

    const { accessToken, refreshToken } = await this.authService.refreshTokens(token);

    res.cookie('accessToken', accessToken, { ...cookieBase, maxAge: FIFTEEN_MINUTES });
    res.cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: SEVEN_DAYS });

    this.logger.log('Refresh token request completed', AuthController.name);
    res.json({ message: 'Tokens refreshed' });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const user = req.user as IUserPayload;
    this.logger.log('Logout request received', AuthController.name, { userId: user.sub });
    await this.authService.logout(user.sub);

    res.clearCookie('accessToken', cookieBase);
    res.clearCookie('refreshToken', cookieBase);

    this.logger.log('Logout request completed', AuthController.name, { userId: user.sub });
    res.json({ message: 'Logged out' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: Request): unknown {
    const user = req.user as IUserPayload;
    this.logger.log('Current user request completed', AuthController.name, {
      userId: user.sub,
    });

    return req.user;
  }
}
