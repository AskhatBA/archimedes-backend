# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with hot reload (ts-node-dev)
npm run build        # Compile TypeScript (tsc + tsc-alias for path aliases)
npm start            # Run compiled output from dist/

npm run db:migrate   # Run Prisma migrations
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:push      # Push schema to DB without migration file
npm run db:studio    # Open Prisma Studio UI
```

There are no tests. `npm test` exits with an error.

## Architecture

### Domain-driven structure

All business logic lives under `src/domains/<domain>/`. Each domain follows this file pattern:

- `.routes.ts` — Express router, registers paths + middleware, wraps handlers with `asyncHandler`
- `.controller.ts` — Request/response handling only; calls service functions
- `.service.ts` — Business logic and data access (Prisma queries)
- `.dto.ts` — TypeScript types for request/response shapes
- `.types.ts` — Types for external API responses (e.g. MIS API)

New domains must be registered in `src/routes.ts` under `/v1/api/<domain>`.

### Error handling

Controllers throw `AppError` (from `@/shared/services/app-error.service`) for known errors — these are caught by the global `errorHandler` middleware (`src/middlewares/error-handler.middleware.ts`) and returned as `{ success: false, message }` with the given status code. Unknown errors are captured by Sentry and return 500.

All async route handlers must be wrapped in `asyncHandler` (from `@/shared/services/async-handler.service`) so thrown errors propagate to the error handler.

### MIS integration

MIS (external medical information system) calls go through `misRequest()` in `src/domains/mis/mis.helpers.ts`. URL templates use `:param` placeholders (e.g. `/beneficiary/:userId/appointments/`), resolved at call time by `resolveApiUrlParams`. All MIS endpoint paths and their HTTP methods/default payloads are declared in `src/domains/mis/mis.constants.ts`.

### Authentication

OTP-based: user receives SMS (via Twilio in production), stores a hashed OTP in Redis, verifies it, then gets a JWT access+refresh token pair. The `authenticate` middleware (`src/middlewares/auth.middleware.ts`) validates the Bearer token and attaches `req.user` (with `id`, `phone`, `role`, `patient`, `doctor`).

### Notification queue

BullMQ queue (`appointment-notifications`) schedules push notifications via OneSignal. The worker (`src/shared/queues/notification.worker.ts`) runs in the same process, started from `server.ts`. Notifications fire 10 minutes before an appointment (or 30s in test mode via `NOTIFICATION_TEST_MODE=true`). Job IDs are `appointment-<appointmentId>` to prevent duplicates.

### Path aliases

`@/` maps to `src/`. Handled by `tsconfig-paths` at runtime and `tsc-alias` at build time.

### Config

All environment variables are centralised in `src/config/index.ts`. Use `config.*` imports — never read `process.env` directly outside that file. `isDevelopment` and `isProduction` helpers are exported from the same file.

### Demo account

`useDemoAccount()` (from `@/shared/helpers`) returns a fixed phone/IIN/OTP for a demo user. Several service methods check `isDemoAccount(phone, iin)` and substitute demo MIS credentials, so real MIS calls are still made but with demo data.
