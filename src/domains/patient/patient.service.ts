import { Prisma } from '@prisma/client';

import * as db from '@/infrastructure/db';

import {
  AdminPatientListItem,
  AdminPatientListParams,
  AdminPatientListResponse,
  PatientDto,
} from './patient.dto';

export const getPatientById = (userId: string) => {
  return db.prismaClient.patient.findUnique({
    where: { userId: userId },
  });
};

export const getPatientByIin = (iin: string) => {
  return db.prismaClient.patient.findUnique({
    where: { iin },
  });
};

export const createPatient = (patient: PatientDto) => {
  return db.prismaClient.patient.create({
    data: {
      userId: patient.userId,
      fullName: `${patient.firstName} ${patient.lastName}`,
      lastName: patient.lastName,
      firstName: patient.firstName,
      patronymic: patient.patronymic || '',
      gender: patient.gender,
      birthDate: patient.birthDate,
      iin: patient.iin,
      misPatientId: patient.misPatientId,
    },
  });
};

/**
 * `fullName` is deliberately not selected. It is encrypted like the name parts, but a
 * chunk of the existing rows hold a `fullName` ciphertext that no longer decrypts under
 * the current key — reading it throws inside the Prisma decryption extension and takes
 * the whole page down. The name parts decrypt fine, so the listing composes the ФИО
 * from those instead; that also gives a consistent `Фамилия Имя Отчество` order, which
 * the stored column does not have.
 */
export const PATIENT_LIST_SELECT = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  patronymic: true,
  birthDate: true,
  gender: true,
  iin: true,
  misPatientId: true,
  user: {
    select: {
      phone: true,
      email: true,
      _count: { select: { appointments: true, insuranceRefundRequests: true } },
    },
  },
} satisfies Prisma.PatientSelect;

type PatientListRow = Prisma.PatientGetPayload<{ select: typeof PATIENT_LIST_SELECT }>;

type PatientNameParts = Pick<PatientListRow, 'firstName' | 'lastName' | 'patronymic'>;

const composeFullName = ({ firstName, lastName, patronymic }: PatientNameParts) =>
  [lastName, firstName, patronymic].filter(Boolean).join(' ');

export const toListItem = ({ user, ...patient }: PatientListRow): AdminPatientListItem => ({
  ...patient,
  fullName: composeFullName(patient),
  phone: user.phone,
  email: user.email,
  appointmentsCount: user._count.appointments,
  refundsCount: user._count.insuranceRefundRequests,
});

/**
 * True for anything the admin could have typed as a number — an IIN, or a phone in any
 * of the shapes people write them (`+7 (777) 123-45-67`, `87771234567`).
 */
const isNumericSearch = (search: string) => /^[\d\s+()\-]+$/.test(search);

/**
 * Name search cannot run in SQL: the name columns are AES-encrypted at rest (see
 * `infrastructure/db/prisma.ts`), so they hold ciphertext and an `ILIKE` would never
 * match. Decryption only happens on the way out of a query, so we pull the name parts,
 * match and sort them here, then read back just the rows for the requested page. IIN
 * and phone are stored in the clear and stay a plain SQL filter.
 */
const searchByName = async (
  where: Prisma.PatientWhereInput,
  needle: string,
  page: number,
  limit: number,
): Promise<AdminPatientListResponse> => {
  const candidates = await db.prismaClient.patient.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, patronymic: true },
  });

  const matched = candidates
    .map((patient) => ({ id: patient.id, fullName: composeFullName(patient) }))
    .filter((patient) => patient.fullName.toLowerCase().includes(needle))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  const pageIds = matched.slice((page - 1) * limit, page * limit).map((patient) => patient.id);

  const rows = pageIds.length
    ? await db.prismaClient.patient.findMany({
        where: { id: { in: pageIds } },
        select: PATIENT_LIST_SELECT,
      })
    : [];

  // `IN` gives no ordering guarantee — restore the name order computed above.
  const byId = new Map(rows.map((row) => [row.id, row]));

  return {
    items: pageIds
      .map((id) => byId.get(id))
      .filter((row): row is PatientListRow => row !== undefined)
      .map(toListItem),
    total: matched.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(matched.length / limit)),
  };
};

/**
 * Dashboard-wide patient listing. Admin-only — the route is behind
 * `requireRole(Role.ADMIN)`, so a patient's mobile token never reaches it.
 */
export const getAdminPatients = async ({
  page,
  limit,
  search,
  gender,
}: AdminPatientListParams): Promise<AdminPatientListResponse> => {
  const where: Prisma.PatientWhereInput = {};

  if (gender) {
    where.gender = gender;
  }

  if (search && !isNumericSearch(search)) {
    return searchByName(where, search.toLowerCase(), page, limit);
  }

  if (search) {
    const digits = search.replace(/\D/g, '');
    where.OR = [{ iin: { contains: digits } }, { user: { phone: { contains: digits } } }];
  }

  const [total, rows] = await Promise.all([
    db.prismaClient.patient.count({ where }),
    db.prismaClient.patient.findMany({
      where,
      // Names are encrypted, so ordering by them in SQL would sort ciphertext. `iin` is
      // plaintext and unique, which makes it the one stable key to paginate on.
      orderBy: { iin: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: PATIENT_LIST_SELECT,
    }),
  ]);

  return {
    items: rows.map(toListItem),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};
