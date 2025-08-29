import axios, { AxiosError } from 'axios';

import { config } from '@/config';
import { AppError } from '@/shared/services/app-error.service';
import { ErrorCodes } from '@/shared/constants/error-codes';

import { FindPatientResponse, CreatePatientDto } from './mis.dto';
import { MISFindPatientResponse } from './mis.types';

const instance = axios.create({
  baseURL: config.mis.apiUrl,
});

export const findPatientByPhone = async (phone: string): Promise<FindPatientResponse> => {
  try {
    const response = await instance.post<MISFindPatientResponse>('/auth/beneficiary-login/', {
      phone_number: phone,
      otp_verified: true,
    });

    const [firstName, lastName, patronymic] = response.data.beneficiary.name.split(' ');

    return {
      id: response.data.beneficiary.id,
      firstName,
      lastName,
      patronymic,
      birthDate: response.data.beneficiary.birth_date,
      iin: response.data.beneficiary.iin,
      gender: response.data.beneficiary.gender === 0 ? 'M' : 'F',
    };
  } catch (error: unknown) {
    const axiosError = error as AxiosError;
    throw new AppError(ErrorCodes.MIS_PATIENT_NOT_FOUND, axiosError?.response?.status);
  }
};

export const createPatient = async (patient: CreatePatientDto): Promise<void> => {
  console.log('Creating patient in MIS...', {
    phone_number: `8${patient.phoneNumber.slice(1)}`,
    name: patient.firstName + ' ' + patient.lastName + ' ' + patient.patronymic,
    gender: patient.gender === 'M' ? 0 : 1,
    birth_date: patient.birthDate,
    iin: patient.iin,
  });
  // try {
  //   await instance.post('/auth/beneficiary-create/', {
  //     phone_number: `8${patient.phoneNumber.slice(1)}`,
  //     name: patient.firstName + ' ' + patient.lastName + ' ' + patient.patronymic,
  //     gender: patient.gender === 'M' ? 0 : 1,
  //     birth_date: patient.birthDate,
  //     iin: patient.iin,
  //   });
  // } catch (error: unknown) {
  //   const axiosError = error as AxiosError;
  //   throw new AppError(ErrorCodes.MIS_PATIENT_NOT_FOUND, axiosError?.response?.status);
  // }
};
