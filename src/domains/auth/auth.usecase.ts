import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { TokenPayload } from './auth.types';

export const generateTokens = (user: TokenPayload) => {
  const accessToken = jwt.sign(user, process.env.JWT_SECRET!, { expiresIn: '15m' });
  const refreshToken = jwt.sign(user, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 10);
};

export const verifyPassword = async (password: string, hash: string) => {
  return bcrypt.compare(password, hash);
};
