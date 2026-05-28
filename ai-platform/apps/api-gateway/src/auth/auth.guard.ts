import { LoggerService } from '@ai-platform/shared';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

type AuthenticatedRequest = {
  method: string;
  url: string;
  cookies?: Record<string, string | undefined>;
  user?: unknown;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly logger: LoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = request.cookies?.accessToken;

    if (!accessToken) {
      this.logger.warn('JWT auth rejected: no accessToken cookie', 'JwtAuthGuard', {
        method: request.method,
        path: request.url,
      });
      throw new UnauthorizedException();
    }

    try {
      request.user = this.jwtService.verify(accessToken);
    } catch {
      this.logger.warn('JWT auth rejected: invalid or expired accessToken', 'JwtAuthGuard', {
        method: request.method,
        path: request.url,
      });
      throw new UnauthorizedException();
    }

    return true;
  }
}

export { JwtAuthGuard as AuthGuard };
