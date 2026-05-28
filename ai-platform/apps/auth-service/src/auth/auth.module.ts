import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '@ai-platform/database';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

const accessTokenExpiresIn = (process.env.ACCESS_TOKEN_EXPIRES ?? '15m') as NonNullable<
  JwtModuleOptions['signOptions']
>['expiresIn'];

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    DatabaseModule,
    JwtModule.register({
      // TODO: replace with JwtModule.registerAsync + ConfigService for production
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: accessTokenExpiresIn },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
