import { Gender } from '@/shared/types/gender';

export type CreateUserDto = {
  email?: string;
  phone: string;
};

export type CreatePatientAccountDto = {
  phone: string;
  iin: string;
  firstName: string;
  lastName: string;
  patronymic?: string;
  birthDate: string;
  gender: Gender;
  misPatientId: string;
};
