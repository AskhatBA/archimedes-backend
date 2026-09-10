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
npm run db:seed-med-account-options  # Seed/refresh the med-account top-up amounts
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

### Medical-account top-ups

The medical account ("медсчёт") is the prepaid balance the clinic keeps for a patient. It
lives in the **insurer's** system: we read the balance through
`GET /v1/api/insurance/med-account` → `/v3/getMedAccount` and credit it through
`/v3/topupBalance`. Both sides of that money are someone else's system, which is what
everything below is shaped around.

The amounts the app offers are ours and live in `MedAccountTopupOption`, served by the
`med-account` domain:

- `GET /v1/api/med-account/options` — the app's list, active rows only, in `sortOrder`
- `GET|POST /v1/api/med-account/options/admin`, `PATCH|DELETE /options/admin/:id` — the
  dashboard's editor, gated on `requireRole(Role.ADMIN)` and audited
  (`MED_ACCOUNT_TOPUP_OPTION_CREATED` / `_UPDATED` / `_DELETED`)

`amount` is unique: the screen is a set of distinct sums, so a duplicate is an editing
mistake rather than a second offer. Deleting an amount is `SetNull` on the top-ups bought
at it — a paid row keeps its own `amount` snapshot and only loses the catalogue pointer.
Seed a fresh database with `npm run db:seed-med-account-options`.

Paying is the `MED_ACCOUNT_TOPUP` purpose. The app posts `POST /v1/api/payment/init` with
`metadata: { optionId }` and nothing else — the **amount is the catalogue's, not the
client's**, and `beforePayment` refuses the checkout while the payer still has an unspent
card if the option has been retired (`MED_ACCOUNT_OPTION_NOT_FOUND`) or if the sum being
charged disagrees with it (`MED_ACCOUNT_TOPUP_AMOUNT_MISMATCH`). There is deliberately no
free-form amount.

When the payment settles the purpose's handler
(`med-account.payment-handler.ts`) writes a `MedAccountTopup`. `paymentId` is unique, so a
replayed FreedomPay callback or the reconciliation sweep cannot record the same top-up
twice, and a top-up therefore never exists without money behind it. The row snapshots the
`beneficiaryId` resolved from MIS at that moment — best effort, because MIS can be down
when a payment settles.

### Crediting a top-up to the insurer

Every top-up starts `PENDING` and becomes `CREDITED` once the money is actually on the
medical account — normally by the insurer's `/v3/topupBalance` seconds after the payment
settles, and by an operator posting it from the dashboard when that call could not be made.

The payment handler enqueues the top-up on the `med-account-credit` BullMQ queue (never
inline — the FreedomPay callback waits on the handler, and the insurer is an external
system), whose worker calls `creditTopup`, which:

- leaves anything that is no longer `PENDING` alone, so a retried job cannot credit the
  same money twice;
- returns immediately when `MED_ACCOUNT_CREDIT_ENABLED=false`, logging that the top-up is
  waiting for an operator — the switch to pull if the insurer's endpoint misbehaves;
- re-resolves `beneficiaryId` when the row has none, so a MIS outage at payment time does
  not strand a top-up;
- marks the row `CREDITED` with whatever reference the insurer returned, or `FAILED` with
  the error, and audits both as `MED_ACCOUNT_TOPUP_CREDITED`.

`creditViaInsurer` builds the insurer's payload. `/v3/topupBalance` identifies the payer by
their **own details** — `lastName` / `firstName` / `middleName` / `iin` / `dateBirth` /
`phoneMobile`, read from our `Patient` row and `User.phone`; the `beneficiaryId` only
authenticates the call in the `Authorization` header. `dateBirth` is the stored `YYYY-MM-DD`
widened to midnight **UTC**, so a birthday cannot slip a day on an eastern offset. A user
with no `Patient` profile cannot be identified at all and goes straight to `FAILED`.

`insuranceId` is the patient's medical-account program: the one `GET /v3/client/programs`
flags `isMedAccount: true` (if several are flagged, the one in force today by date, else the
first). Any other program is plain insurance cover and is never sent. A patient with no such
program gets `null` — a valid value for the insurer — and so does a patient whose program
list could not be read, since an unreadable list is not worth failing a settled payment over.
`isMedAccount` is also passed through to the app on `GET /v1/api/insurance/programs`.

`creditTopup` never throws: the payment has settled and the record must survive whatever the
insurer does. The insurer call sits **outside** the bookkeeping around it, because
`/v3/topupBalance` takes no idempotency key and a second call would credit the money twice —
so a DB write that fails after a successful credit is logged and swallowed, never rethrown
into a retry. That leaves the row `PENDING` for an operator, which is the recoverable
direction.

The dashboard works the queue:

- `GET /v1/api/med-account/topups/admin` — paginated, filterable by status/date/search
  (patient name, IIN, phone), with the summed amount of the filtered set
- `PATCH /v1/api/med-account/topups/admin/:id` — only `status` and `comment`; the amount
  belongs to the payment and is immutable. `creditedAt` follows `status` rather than being
  editable on its own, so the queue cannot lie about what has been posted. Audited as
  `MED_ACCOUNT_TOPUP_STATUS_CHANGED`.
- `GET /v1/api/med-account/topups` — the caller's own history. Registered **after**
  `/topups/admin`, otherwise the admin listing is swallowed.

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
  paginated, filterable by status, telemedicine flag, `paid`, day range and a search that
  matches patient name / IIN / phone, or any of the three MIS ids when the term is a UUID
- `GET /v1/api/appointments/admin/:id`

Both carry the visit's `payment` — amount, `status`, `description`, the FreedomPay
`pgPaymentId` an operator searches the merchant cabinet by, and when it was charged — plus
`isPaid`, which is that payment being `SUCCESS`. `payment: null` means the visit went
through an insurance programme: the insurer paid and there is no transaction of ours.

What counts as "paid" is decided in one place, `appointment-payment.service.ts`, because
two callers answer with it: the dashboard listing and the cancellation, which uses the same
rule to decide whether the clinic owes a refund. Normally it is `Appointment.paymentId`,
set by the `APPOINTMENT` purpose handler at booking. Visits booked before that column
existed have real money behind them and no link, so their payment is matched by metadata —
a successful, unlinked `APPOINTMENT` payment of the same user whose `doctorId` and
`startTime` are the ones the visit was created from — and the link is written back, one
query per page rather than one per row. The `paid` filter reads only the stored column, so
such a visit files under "по программе" until a page showing it back-fills the link.

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

### Cancelling an appointment

A patient cancels a visit with `PATCH /v1/api/appointments/:id/cancel`, and the app can ask
`GET /v1/api/appointments/:id/cancellation` first for what that would cost — the confirmation
screen has to show the retained compensation before the tap, not after. Both accept **either**
our `Appointment.id` or the MIS id the visit is known by, because the app's list is proxied
live from MIS and what it holds is `externalId`. The old MIS proxy
`DELETE /v1/api/mis/appointments/:appointmentId` now runs the same flow, falling back to a
direct MIS delete only for a visit we have no row for — otherwise an existing app build would
keep cancelling paid visits without refunding them.

Cancellation is refused for anything that is not a future `SCHEDULED` visit:
`APPOINTMENT_NOT_CANCELLABLE` for one already cancelled or completed, and
`APPOINTMENT_ALREADY_STARTED` once its time has passed — a visit that has begun is the front
desk's to close, and refunding a completed one is exactly what that guard prevents.

The order of operations is the whole design. MIS goes **first**
(`DELETE /beneficiary/:userId/appointment-requests/:requestId/`, keyed by the appointment's own
`patientId` so a relative's booking resolves, same as the status sweep reads it), and any error
from it propagates untouched: cancelling locally — let alone refunding — while the booking is
still live in MIS is the one outcome worth failing the request over. A visit already gone from
MIS is not special-cased either, since `parseApiError` folds 401s and network errors into 404;
the status sweep will bring that row to `CANCELLED` on its own.

Only then, in one transaction, the row moves to `CANCELLED` and — for a paid visit — an
`AppointmentRefund` is written. The update is conditional on `status = SCHEDULED`, so a
double-tapped cancel has exactly one winner, and `AppointmentRefund.appointmentId` is unique
behind that.

### Refunding a cancelled paid visit

What separates a paid visit from a programme one is **our** payment, not anything MIS says:
`Appointment.paymentId` is set by the `APPOINTMENT` purpose handler when the booking is made,
so a visit with no payment was covered by the insurer and there is nothing to return. Visits
booked before that column existed are matched to their payment by metadata instead — a
successful `APPOINTMENT` payment of the same user whose `doctorId` and `startTime` are the ones
the visit was created from — and the link is written back so it is found directly next time.

`planRefund` splits the money: cancelling at least `APPOINTMENT_REFUND_FULL_WINDOW_HOURS` (12)
before the visit returns 100%, later than that keeps
`APPOINTMENT_LATE_CANCELLATION_FEE_PERCENT` (30), so the patient gets 70%. The decision is made
on the unrounded difference while `hoursBefore` is stored rounded, and `feeAmount` is
`paidAmount - amount` rather than a second percentage, so the two always add back up to what
was charged. The row records the percentage and the hours it was decided on, because none of it
can be recomputed later — `now` has moved.

The refund is enqueued on the `appointment-refund` BullMQ queue, never sent inline: FreedomPay
is external, and the patient's cancel request must not wait on it. Failing to enqueue is logged
and swallowed — the debt is already written and visible in the dashboard, and losing the job
must not fail a cancellation the patient already made in MIS.

`processAppointmentRefund` calls `revoke.php` with `pg_refund_amount` (`refundPayment` in
`payment.service.ts`, signed as `revoke.php` like every other FreedomPay script) and then:

- leaves anything not `PENDING` alone, so it cannot reverse the same charge twice;
- returns immediately when `APPOINTMENT_REFUND_ENABLED=false`, leaving the refund for an
  operator — the switch to pull if the provider misbehaves;
- marks the row `COMPLETED` with whatever reference came back, or `FAILED` with the reason,
  and audits both as `APPOINTMENT_REFUND_PROCESSED`;
- treats `pending` from the provider as an acceptance it must not re-send: the row stays
  `PENDING` with a comment for an operator to confirm.

It never throws, and the queue is configured with **`attempts: 1` on purpose**. `revoke.php`
takes no idempotency key and partial refunds against one payment *accumulate*, so an automatic
retry of a job that died between the provider call and the DB write would return the money a
second time. Anything unresolved therefore stays `PENDING` or lands in `FAILED` for a human —
the recoverable direction. For the same reason an unreachable provider is recorded as `FAILED`
rather than retried: "FreedomPay said no" and "we do not know what FreedomPay did" both need
eyes on the merchant cabinet.

The dashboard works that queue:

- `GET /v1/api/appointments/admin/refunds` — paginated, filterable by status/date/search
  (patient name, IIN, phone), with the summed amount of the filtered set
- `PATCH /v1/api/appointments/admin/refunds/:id` — only `status` and `comment`; the amount
  belongs to the payment and is immutable, and `refundedAt` follows `status` so the queue
  cannot lie about what has been posted. Audited as `APPOINTMENT_REFUND_STATUS_CHANGED`. It
  deliberately does **not** call FreedomPay — that would be a second `revoke` on the same
  payment; it records a reversal an operator already made by hand.

`/admin/refunds` is registered before `/admin/:id`, otherwise the by-id handler swallows it.

Env: `APPOINTMENT_REFUND_ENABLED` (default on), `APPOINTMENT_REFUND_FULL_WINDOW_HOURS` (12),
`APPOINTMENT_LATE_CANCELLATION_FEE_PERCENT` (30 — `0` is a valid value and is read as one).

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
