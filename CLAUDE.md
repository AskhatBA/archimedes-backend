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

npm run db:seed-checkups  # Seed/refresh the check-up catalogue
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

`requireRole(...roles)` (`src/middlewares/require-role.middleware.ts`) runs after `authenticate` and 403s anyone whose role is not in the list. Use it for anything the mobile app must never reach.

### Dashboard admin

The web dashboard (separate repo, `archimedes-dashboard`) signs in with email + password at `POST /v1/api/auth/admin/login`, not OTP. Only accounts with `role = ADMIN` and a `passwordHash` can log in, and `GET /v1/api/auth/admin/me` is gated on `requireRole(Role.ADMIN)` — a patient's valid mobile token authenticates but gets 403 there, which is what keeps it out of the dashboard.

There is deliberately **no sign-up endpoint**. The single admin is provisioned from `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_PHONE` by:

```bash
npm run db:create-admin
```

The script refuses to create a second ADMIN, hashes the password with bcrypt (cost 12) into `User.passwordHash`, and bumps `tokenVersion` when re-run so a password rotation revokes the old session. Passwords are never stored or logged in clear text — `password`/`passwordHash` are in the logger's redact list.

Every login failure returns the same `INVALID_CREDENTIALS` regardless of cause (unknown email, non-admin account, wrong password), and a missing account still pays the bcrypt cost, so neither the body nor the timing reveals which emails exist. Failures are counted per email in Redis by `login-throttle.service.ts` (`ADMIN_MAX_LOGIN_ATTEMPTS`, default 5, over `ADMIN_LOCK_MINUTES`, default 15) and audited as `ADMIN_LOGIN_SUCCESS` / `ADMIN_LOGIN_FAILED` / `ADMIN_LOGIN_THROTTLED`.

### Check-up catalogue

The mobile app's paid-programs screen has two tabs. `MED_PLAN` is proxied from the MIS
(`GET /v1/api/insurance/pay-programs`), but check-ups are ours: they live in the `Checkup`
table and are served by the `checkups` domain at `GET /v1/api/checkups` (and
`GET /v1/api/checkups/:id`, which accepts either the uuid or the stable `code` slug).
Both endpoints require `authenticate` and return only rows with `isActive = true`,
ordered by `sortOrder`.

The dashboard edits the catalogue through the admin endpoints, all gated on
`requireRole(Role.ADMIN)` and written to the audit trail (`CHECKUP_CREATED`,
`CHECKUP_UPDATED`, `CHECKUP_DELETED`):

- `GET /v1/api/checkups/admin` — the whole catalogue, unpublished rows included
- `POST /v1/api/checkups/admin` — create; a duplicate `code` is a 409 `CHECKUP_CODE_TAKEN`
- `PATCH /v1/api/checkups/admin/:id` — partial update; only the keys sent are written
- `DELETE /v1/api/checkups/admin/:id` — hard delete

`/admin` is registered before `/:id` in the router, otherwise the by-id handler swallows it.

The catalogue is seeded from the clinic's price list by:

```bash
npm run db:seed-checkups
```

The script (`src/infrastructure/db/scripts/seed-checkups.ts`) upserts on `code`, so it is
safe to re-run: it refreshes what the price list owns (title, price, services, ordering)
and leaves the columns an operator curates in the database — `description`, `duration`,
`coverage`, `popular` — untouched on rows that already exist. Retire an entry by setting
`isActive = false` rather than deleting it, so old references keep resolving.

### Paid-programs orders

The paid-programs cart is not paid for through the generic payment form: checkout calls
`POST /v1/api/payment/init` with `purpose: PAID_PROGRAM` and the cart as `metadata`, and
the order ("заявка") is written to the `ProgramOrder` / `ProgramOrderItem` tables by the
purpose's post-success handler (`src/domains/program-orders/program-order.payment-handler.ts`)
the moment the payment settles as SUCCESS — from the FreedomPay callback or from the
reconciliation sweep, so it lands even if the app was closed on the provider's page. An
order therefore never exists without money behind it, and `ProgramOrder.paymentId` is
unique, so a replayed callback cannot duplicate one.

Checkout is refused at init time — while the payer still has an unspent card — if a
check-up has been retired or repriced since the catalogue was cached on the device
(`PROGRAM_ORDER_PRICE_CHANGED`), or if the item prices do not add up to the amount being
charged (`PROGRAM_ORDER_TOTAL_MISMATCH`). Check-up titles and codes are re-read from our
catalogue when the order is written; med-plan rows keep the MIS snapshot the app showed,
since the MIS owns those prices.

The `program-orders` domain serves them:

- `GET /v1/api/program-orders` — the caller's own orders, newest first
- `GET /v1/api/program-orders/:id` — one of them, scoped to the caller
- `GET /v1/api/program-orders/admin` — dashboard listing (`requireRole(Role.ADMIN)`),
  paginated, filterable by status/category/date/search, with the summed total of the
  filtered set
- `GET /v1/api/program-orders/admin/:id`
- `PATCH /v1/api/program-orders/admin/:id` — move the order along (`NEW`, `IN_PROGRESS`,
  `COMPLETED`, `CANCELLED`) or leave an operator note; amounts and items are immutable

`/admin` is registered before `/:id`, otherwise the by-id handler swallows it. Status
moves are audited as `PROGRAM_ORDER_STATUS_CHANGED`, and the handler's write as
`PROGRAM_ORDER_CREATED`.

### Notification queue

BullMQ queue (`appointment-notifications`) schedules push notifications via OneSignal. The worker (`src/shared/queues/notification.worker.ts`) runs in the same process, started from `server.ts`. Two reminders fire per appointment — 3 hours and 1 hour before it (or 30s/60s after creation in test mode via `NOTIFICATION_TEST_MODE=true`). Offsets are declared in `APPOINTMENT_REMINDERS` in `notification.queue.ts`. Job IDs are `appointment-<appointmentId>-<3h|1h>` to prevent duplicates; cancelling also removes the legacy `appointment-<appointmentId>` job from the old single-reminder scheme.

### Path aliases

`@/` maps to `src/`. Handled by `tsconfig-paths` at runtime and `tsc-alias` at build time.

### Logging

Pino, configured in `src/shared/lib/logger/`. Never use `console.*` — get a logger with `createLogger('<component>')` (from `@/shared/lib/logger`) and call it as `log.info({ ...fields }, 'Message')`: structured fields first, a static message second.

`requestContext` + `httpLogger` (`src/middlewares/request-logger.middleware.ts`) run before every route. `requestContext` opens an `AsyncLocalStorage` scope holding a `reqId` (reused from the `x-request-id` header when present, and echoed back on the response), and the logger's mixin stamps `reqId`/`userId`/`role` onto every line emitted while handling that request — including logs from services deep in the call stack. This is what lets one filter show the whole request.

Sensitive fields (IIN, phone, OTP, PIN, tokens, secrets, `authorization` header) are censored inside the logger by `src/shared/lib/logger/redact.ts`, so even a whole axios error or MIS response can be logged safely. Add new sensitive field names to `SENSITIVE_KEYS` there rather than stripping them at call sites.

Output is JSON on stdout; `pino-pretty` is enabled in development. Controlled by `LOG_LEVEL` (default `info` in production, `debug` otherwise) and `LOG_PRETTY`.

### Config

All environment variables are centralised in `src/config/index.ts`. Use `config.*` imports — never read `process.env` directly outside that file. `isDevelopment` and `isProduction` helpers are exported from the same file.

### Demo account

`useDemoAccount()` (from `@/shared/helpers`) returns a fixed phone/IIN/OTP for a demo user. Several service methods check `isDemoAccount(phone, iin)` and substitute demo MIS credentials, so real MIS calls are still made but with demo data.
