export interface IUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface ILoginDto {
  email: string;
  password: string;
}

export interface IRegisterDto {
  email: string;
  password: string;
  name: string;
}

export interface IAuthResponse {
  status: number;
}
