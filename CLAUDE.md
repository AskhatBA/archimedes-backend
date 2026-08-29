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

### Order emails

Besides the row in our tables, every settled paid-programs order is emailed to the
operators. The payment handler only **enqueues** it (`enqueueProgramOrderEmail`) — the
FreedomPay result callback waits on that handler, so the SMTP round-trip belongs on
the `program-order-email` queue, whose worker (`program-order-email.worker.ts`, started
from `server.ts`) re-reads the order with `getOrderForEmail` and sends it. Failing to
enqueue is logged and swallowed: the order is already written and visible in the
dashboard, and losing the email must not fail the payment.

The job id is `program-order-email-<orderId>`, so a replayed provider callback or the
reconciliation sweep landing on the same order cannot send a second copy. A refused
relay is retried 5 times with exponential backoff (from 30s); a job that runs after the
order was deleted logs and exits rather than retrying.

The message body (`program-order.email.ts`) is the same view the dashboard row shows —
order id, time in clinic time (Asia/Almaty), patient name/IIN/phones, comment, the
items with their category and price, and the total — as HTML with a plain-text
fallback. Titles and comments are patient/catalogue text and are HTML-escaped.

SMTP lives in `src/infrastructure/mail/` — one pooled nodemailer transport built lazily
and reused. `sendMail` throws on failure so the queue retries; never call it inline in a
request. Env:

- `SMTP_HOST` (`mail.archimedes.kz`), `SMTP_PORT` (25), `SMTP_SECURE` (`false` — `true`
  only for implicit TLS on 465; port 25 upgrades via STARTTLS when offered)
- `SMTP_USER` / `SMTP_PASSWORD` — the relay is Exchange and answers unauthenticated,
  but only for its own domain: an outside recipient (a gmail address, say) is
  refused with `550 5.7.1 Unable to relay`, so a mailbox account is required for
  anything but `@archimedes.kz`. Setting them also turns STARTTLS from optional into
  required, so the password never crosses a cleartext session
- `SMTP_TLS_REJECT_UNAUTHORIZED` (`false`) — the internal relay's certificate is
  self-signed
- `MAIL_FROM` — the `From` header; keep the domain on the relay or the mail is filtered
- `MAIL_ENABLED` — `false` stops sending without touching code (jobs still succeed)
- `PROGRAM_ORDER_EMAIL_TO` — **who receives the orders**, comma-separated, so a recipient
  is changed or added without a deploy. Defaults to the single personal address the
  orders currently go to until the clinic's own mailbox takes over.

### Appointments in the dashboard

Appointments are booked through MIS (`mis.service.createAppointment`), and our
`Appointment` row is the local shadow of that booking: `patientId`, `doctorId` and
`externalId` are **MIS** ids, while the account behind the visit is reachable only
through `userId` → `User` → `Patient`. Booking for a relative stores the relative's MIS
id, which is why a row whose `patientId` differs from the account's own `misPatientId` is
flagged as a family-member visit rather than shown under the account owner's name.

- `GET /v1/api/appointments/admin` — dashboard listing (`requireRole(Role.ADMIN)`),
  paginated, filterable by status, telemedicine flag, day range and a search that matches
  patient name / IIN / phone, or any of the three MIS ids when the term is a UUID
- `GET /v1/api/appointments/admin/:id`

Both live in `appointments.admin.service.ts`, not in `appointments.service.ts`: they need
`mis.service` to put a name on `doctorId`, and `mis.service` already imports
`appointments.service` for the booking-conflict rules, so the split is what keeps that
import cycle open. Doctor lookups are per unique id per page and cached in-process for 10
minutes; when MIS is unreachable the name comes back `null` and the row still carries
`doctorId` — a MIS outage must not empty the queue.

Day filters are `YYYY-MM-DD` and are read as whole **clinic** days (Asia/Almaty, the same
`CLINIC_UTC_OFFSET` the conflict rules use), so an evening slot does not fall off the end
of a range on a UTC server. As with program orders, `/admin` is registered before `/:id`.

The dashboard never writes an appointment: the visit lives in MIS, and moving or
cancelling it from the admin panel would leave the two systems disagreeing.

### Appointment status sync

MIS owns the status of a visit and never calls us back when it changes, so an `Appointment`
row would sit at `SCHEDULED` forever after the doctor closed the visit or the front desk
cancelled it. The mobile app hides this — its list is proxied live from MIS
(`GET /v1/api/mis/appointments`) — but the dashboard reads our tables, so a background sweep
keeps them honest.

`syncAppointmentStatuses()` (`appointments.sync.service.ts`) runs on the BullMQ queue
`appointment-status-sync`, scheduled from `server.ts` with the same `upsertJobScheduler`
pattern as payment reconciliation, and can be triggered by hand from the dashboard with
`POST /v1/api/appointments/admin/sync` (`requireRole(Role.ADMIN)`), which answers with what
the sweep did.

It polls **per MIS patient, not per appointment**: one `GET /beneficiary/:userId/appointments/`
plus one `.../appointment-requests/?include_past=true` return every visit of that beneficiary,
so a day's queue costs a handful of requests. Both lists are read because `externalId` holds
whatever MIS returned at booking — the request id when the booking went through a request,
the appointment id otherwise — and an approved request also carries `appointment_id`, which
goes into the same lookup table so an approved request is still found.

Rules the sweep follows:

- The queue is split by how close the visit is, so a booking three months out cannot crowd
  out tomorrow's. **Hot** rows — from `MIS_APPOINTMENT_SYNC_LOOKBACK_DAYS` (7) back to
  `MIS_APPOINTMENT_SYNC_HOT_HORIZON_HOURS` (48) ahead — are checked every pass and get the
  budget first. **Cold** rows, further out than the horizon, are picked up only with the
  budget left over and only when their last check is older than
  `MIS_APPOINTMENT_SYNC_COLD_INTERVAL_HOURS` (24); nothing is lost, because such a booking
  moves into the hot tier by itself once the horizon reaches it. A cold row belonging to a
  patient already being polled rides along for free — MIS returns that patient's statuses in
  one answer either way.
- The hot horizon is bounded from below by the reminders: they go out 3 hours before the
  visit, so a cancellation has to be known before that, or the push lands on a cancelled
  appointment.
- Within each tier rows are ordered by `statusSyncedAt` ascending with nulls first — a
  just-booked visit is confirmed before an old one is re-checked, and over a few passes the
  whole tier is covered.
- MIS status strings are mapped in `MIS_STATUS_MAP`. An unknown string is not an error: it is
  stored raw in `Appointment.misStatus`, our `status` is left alone, and the string is logged
  so it can be added deliberately.
- A row MIS does not mention is left untouched and counted as `notFound`. Deletion in MIS and
  silence from MIS are indistinguishable, and "cancel just in case" cancels live visits.
- A patient MIS fails to answer for is skipped, not retried inside the run: their rows keep
  the old `statusSyncedAt` and lead the next pass.
- A real status change also fixes the reminders — `cancelAppointmentNotification` when the
  visit leaves `SCHEDULED`, `scheduleAppointmentNotification` when it comes back — and is
  written to the audit trail as `APPOINTMENT_STATUS_SYNCED`.

The sweep syncs status only. It deliberately does not move `dateTime`: a visit rescheduled in
MIS still shows its original time here.

A run reports `checked / patients / hotPatients / coldPatients / updated / notFound /
failedPatients`, so `coldPatients` staying at 0 is the sign the hot tier is eating the whole
budget and `batchSize` needs raising.

Env: `MIS_APPOINTMENT_SYNC_ENABLED` (default on — set `false` to stop the schedule, which the
next boot then removes), `MIS_APPOINTMENT_SYNC_INTERVAL_SECONDS` (900),
`MIS_APPOINTMENT_SYNC_BATCH_SIZE` (25 patients per run),
`MIS_APPOINTMENT_SYNC_SPACING_MS` (300), `MIS_APPOINTMENT_SYNC_LOOKBACK_DAYS` (7),
`MIS_APPOINTMENT_SYNC_HOT_HORIZON_HOURS` (48),
`MIS_APPOINTMENT_SYNC_COLD_INTERVAL_HOURS` (24). Keep `batchSize * spacing` below the
interval or sweeps overlap.

Sizing: one run costs two MIS requests per patient (~0.45s each with the default spacing), so
a full sweep of the queue takes `ceil(P / batchSize) * interval`, where `P` is the number of
distinct MIS patients with open appointments — not the number of accounts. Keep that below
the 3-hour reminder for the hot tier.

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
