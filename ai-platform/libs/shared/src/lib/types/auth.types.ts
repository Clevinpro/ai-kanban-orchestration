export interface ITokens {
  accessToken: string;
  refreshToken: string;
}

export interface IGoogleProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}
