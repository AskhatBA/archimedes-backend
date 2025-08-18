import * as db from '@/infrastructure/db';

import { User, Role } from './auth.types';
import { CreateUserDto } from './auth.dto';

export const findUserById = async (userId: string): Promise<User | null> => {
  return db.prismaClient.user.findUnique({
    where: { id: userId },
  });
};

export const findUserByPhone = async (phone: string): Promise<User | null> => {
  return db.prismaClient.user.findUnique({
    where: { phone: phone },
  });
};

export const createUser = async (user: CreateUserDto) => {
  return db.prismaClient.user.create({
    data: {
      phone: user.phone,
      email: user.email || null,
      role: Role.PATIENT,
    },
  });
};

export const saveRefreshToken = async (userId: string, token: string) => {
  await db.prismaClient.user.update({
    where: { id: userId },
    data: { refreshToken: token },
  });
};
