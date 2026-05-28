export interface IUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPayload {
  sub: string;
  email: string;
  name: string;
}
