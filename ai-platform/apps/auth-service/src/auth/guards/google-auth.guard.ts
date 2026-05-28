import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  // TODO: override canActivate if custom logic is needed (e.g. state param, PKCE)
}
