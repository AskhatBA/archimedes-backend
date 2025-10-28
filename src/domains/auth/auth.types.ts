import { User as DbUser, Role as DbRole } from '@prisma/client';

export type Role = DbRole;
export const Role = DbRole;

export type User = DbUser;

export interface TokenPayload {
  id: string;
}
