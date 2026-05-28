import { apiClient } from '../client';
import type { IAuthResponse, ILoginDto, IRegisterDto, IUser } from '../types/auth.types';

/** Paths are relative to `API_URL`, which includes the global `/api` prefix. */
const AUTH_PREFIX = '/auth';

export async function login(dto: ILoginDto): Promise<IAuthResponse> {
  const res = await apiClient.post(`${AUTH_PREFIX}/login`, dto);
  return { status: res.status };
}

export async function register(dto: IRegisterDto): Promise<IAuthResponse> {
  const res = await apiClient.post(`${AUTH_PREFIX}/register`, dto);
  return { status: res.status };
}

export async function logout(): Promise<void> {
  await apiClient.post(`${AUTH_PREFIX}/logout`);
}

export async function refresh(): Promise<void> {
  await apiClient.post(`${AUTH_PREFIX}/refresh`);
}

export async function getMe(): Promise<IUser> {
  const res = await apiClient.get<IUser>(`${AUTH_PREFIX}/me`);
  return res.data;
}
