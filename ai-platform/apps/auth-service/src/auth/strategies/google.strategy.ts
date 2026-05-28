import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { IGoogleProfile } from '@ai-platform/shared';

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: getRequiredEnv('GOOGLE_CLIENT_ID'),
      clientSecret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
      callbackURL: getRequiredEnv('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails: { value: string }[];
      name: { givenName: string; familyName: string };
      photos: { value: string }[];
    },
    done: VerifyCallback,
  ): Promise<void> {
    const googleProfile: IGoogleProfile = {
      id: profile.id,
      email: profile.emails[0].value,
      name: `${profile.name.givenName} ${profile.name.familyName}`.trim(),
      avatar: profile.photos?.[0]?.value,
    };

    done(null, googleProfile);
  }
}
