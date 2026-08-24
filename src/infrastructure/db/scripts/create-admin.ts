/**
 * Provision (or re-provision) the single Archimedes dashboard admin.
 *
 * The dashboard has no sign-up endpoint on purpose — the one operator account
 * is created here, from environment variables, and every other account in the
 * database stays a PATIENT/DOCTOR that `/auth/admin/*` rejects.
 *
 * Reads ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_PHONE. Safe to re-run: running it
 * again with a new ADMIN_PASSWORD rotates the password and invalidates every
 * outstanding session for that account.
 *
 * Refuses to create a *second* admin — if an ADMIN already exists under a
 * different email, demote or delete it first. This is the single-account rule.
 *
 * Run with:  npm run db:create-admin
 */
import { Role } from '@prisma/client';

import { config } from '@/config';
import { prismaClient } from '@/infrastructure/db';
import { hashPassword, assertValidPasswordFormat } from '@/shared/services/password.service';

const PHONE_REGEX = /^7\d{10}$/;

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const main = async () => {
  const email = config.admin.email?.trim().toLowerCase();
  const password = config.admin.password;
  const phone = config.admin.phone?.trim();

  if (!email) {
    fail('ADMIN_EMAIL is not set.');
  }

  // User.phone is required and unique, so the admin needs one even though it is
  // never used to sign in to the dashboard.
  if (!phone || !PHONE_REGEX.test(phone)) {
    fail('ADMIN_PHONE must be set to a phone starting with 7 followed by 10 digits.');
  }

  try {
    assertValidPasswordFormat(password);
  } catch {
    fail(
      'ADMIN_PASSWORD must be at least 12 characters (max 72 bytes) and contain both a letter and a digit.'
    );
  }

  const otherAdmin = await prismaClient.user.findFirst({
    where: { role: Role.ADMIN, email: { not: email! } },
  });

  if (otherAdmin) {
    fail(
      `An admin account already exists (${otherAdmin.email ?? otherAdmin.id}). ` +
        'The dashboard is limited to one admin — remove or demote that account before creating another.'
    );
  }

  const existingByEmail = await prismaClient.user.findUnique({ where: { email: email! } });
  const existingByPhone = await prismaClient.user.findUnique({ where: { phone: phone! } });

  if (existingByEmail && existingByEmail.role !== Role.ADMIN) {
    fail(
      `${email} already belongs to a ${existingByEmail.role} account. ` +
        'Pick a different ADMIN_EMAIL rather than promoting a patient account.'
    );
  }

  if (existingByPhone && existingByPhone.id !== existingByEmail?.id) {
    fail(`ADMIN_PHONE ${phone} is already used by another account.`);
  }

  const passwordHash = await hashPassword(password as string);

  if (existingByEmail) {
    const updated = await prismaClient.user.update({
      where: { id: existingByEmail.id },
      data: {
        passwordHash,
        phone: phone!,
        role: Role.ADMIN,
        // Rotating the password must log out whoever was signed in with the old one.
        tokenVersion: { increment: 1 },
        refreshTokenHash: null,
      },
    });

    console.log(`✓ Admin password updated for ${email} (id ${updated.id}). Existing sessions revoked.`);

    return;
  }

  const created = await prismaClient.user.create({
    data: {
      email: email!,
      phone: phone!,
      role: Role.ADMIN,
      passwordHash,
    },
  });

  console.log(`✓ Admin account created for ${email} (id ${created.id}).`);
};

main()
  .catch((err) => {
    console.error('✗ Failed to provision the admin account:', err);
    process.exit(1);
  })
  .finally(() => prismaClient.$disconnect());
