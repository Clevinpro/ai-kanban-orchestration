export const JWT_SECRET = process.env['JWT_SECRET'] ?? 'jwt-secret';

export const GOOGLE_CALLBACK_URL =
  process.env['GOOGLE_CALLBACK_URL'] ?? 'http://localhost:3000/auth/google/callback';
