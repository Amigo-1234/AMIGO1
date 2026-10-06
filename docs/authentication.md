# Authentication and authorization

Markaz il Ginna has two completely separate sign-in systems:

|                | Staff                                      | Students and parents                               |
| -------------- | ------------------------------------------ | -------------------------------------------------- |
| Credentials    | Email and password                         | Student ID + 6-digit PIN                           |
| Verified by    | **Neon Auth** (hosted Better Auth)         | This application (argon2id hashes in PostgreSQL)   |
| Session        | Neon Auth cookies (`__Secure-neon-auth.*`) | Our own server-side session (`__Host-mig_student`) |
| Access control | Permissions from roles (+ overrides)       | The student's own records only                     |
| Pages          | `/<locale>/admin/...`                      | `/<locale>/portal/...`                             |

Code: `src/server/staff-auth/`, `src/server/student-auth/`, `src/server/auth/` (shared
hashing and throttling), `src/server/audit.ts`, `src/proxy.ts`.

## Staff: Neon Auth

Staff authentication uses the Next.js server integration of `@neondatabase/auth`
(pinned to `0.5.0-beta`), following the package's documented server-side pattern:

- `src/server/staff-auth/neon-config.ts` creates one `createNeonAuth({ baseUrl, cookies })`
  instance from `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`.
- Sign-in and sign-out are **Server Actions** that call `auth.signIn.email()` /
  `auth.signOut()` on the server. Passwords go from our server to Neon Auth; no client-side
  auth SDK is shipped and no `/api/auth/*` proxy route is exposed, so there is no public
  sign-up endpoint on our domain.
- Neon Auth stores its session in `__Secure-neon-auth.*` cookies (HttpOnly, Secure,
  SameSite=Lax) and caches verified session data in a cookie signed with
  `NEON_AUTH_COOKIE_SECRET`, re-validated with Neon at least every 5 minutes.
- `src/proxy.ts` runs Neon Auth's middleware for `/<locale>/admin/*`: it verifies and
  refreshes the session before anything renders and redirects signed-out staff to
  `/<locale>/staff/login` (with `?reason=expired` if a stale session cookie was sent).

### Authentication is not authorization

A valid Neon Auth session grants nothing by itself. Access requires an **explicit** row in
`staff_users` whose `auth_user_id` equals the Neon Auth user ID, with `status = 'active'`.
Staff are never matched by email. Every request evaluates (`evaluateStaffSession`):

| State            | Meaning                                                      | Result                        |
| ---------------- | ------------------------------------------------------------ | ----------------------------- |
| `not_configured` | Neon Auth environment variables missing                      | "Sign-in not available"       |
| `signed_out`     | No valid Neon session (`expired` if a stale cookie was sent) | Redirect to sign-in           |
| `unmapped`       | Valid Neon identity, no linked staff record                  | Signed out, "no staff access" |
| `inactive`       | Linked record is invited/suspended/deactivated               | Signed out, "not active"      |
| `ok`             | Active staff with resolved permissions                       | Access                        |

Status is read from the database on every request, so disabling a staff member takes
effect immediately, even while their Neon session is still valid.

### Permissions

Authorization checks **permission keys** (`src/domain/permissions.ts`), never role names.
Effective permissions = permissions of every held role + individual grants − individual
denials (a denial always wins). Super Admin holds every permission through its role.

| Use                           | Primitive                                                 |
| ----------------------------- | --------------------------------------------------------- |
| Current state in a page       | `getCurrentStaff()` (cached per request)                  |
| Page that needs staff         | `await requireStaff(locale)`                              |
| Page that needs a permission  | `await requireStaffPermission(locale, "results.publish")` |
| Server Action / route handler | `await authorizeStaffAction("payments.record")` (throws)  |
| Conditional UI                | `hasPermission(access, "fees.read")` (display only)       |

Hiding a button is never the check: every Server Action must call
`authorizeStaffAction(...)` itself, so calling it directly without a session or permission
is rejected.

Staff management rules (`management.ts`): `staff.manage` is required; nobody changes their
own status or removes their own Super Admin role; the last active Super Admin cannot be
disabled or demoted; nobody can grant a role carrying permissions they do not hold.

### First Super Admin (one-time bootstrap)

There are no staff records initially. The first Super Admin is created through a one-time
setup page that is only reachable when **all** of these hold:

- Neon Auth is configured,
- `STAFF_BOOTSTRAP_TOKEN` (at least 32 random characters) is set,
- no `staff_users` row exists and the `auth.staff_bootstrap` marker is absent.

Otherwise `/<locale>/staff/setup` returns 404 for everyone.

Procedure:

1. Generate a code, e.g. `openssl rand -base64 48`, and set it as `STAFF_BOOTSTRAP_TOKEN`
   in Vercel (Production). Redeploy.
2. Open `https://<your-domain>/en/staff/setup` (or `/ar/staff/setup`).
3. Enter the code, your full name, email address and a password (8+ characters), and submit.
   The page creates your Neon Auth account (or signs in if it already exists). If Neon Auth
   requires email verification, verify the address and submit the same form again.
4. In one locked transaction the app creates your active staff record linked to that Neon
   identity, grants Super Admin, writes the `auth.staff_bootstrap` marker and records a
   `staff.bootstrapped` audit entry. You land on `/<locale>/admin`.
5. Remove `STAFF_BOOTSTRAP_TOKEN` from Vercel. The page is already permanently closed by
   the marker and the existing staff record; removing the code is defence in depth.

Wrong codes are compared in constant time and throttled per network address.

## Students and parents

### Signing in

- **Student ID**: the permanent Markaz ID or any registered V1 alias
  (`student_identifiers`), case-insensitive, spaces/underscores tolerated.
- **PIN**: exactly 6 digits (validated in the browser for convenience and on the server
  as the authority).
- Wrong PIN and unknown ID return the same message, and an unknown ID still costs a full
  hash verification (dummy hash) so timing does not reveal which IDs exist.
- Students with status `active` or `graduated` may sign in. `suspended`, `withdrawn` and
  `archived` students are refused, but only after correct credentials, and their
  existing sessions are revoked on the next request.

### Credential storage

PINs (and migrated V1 passwords) are hashed with **argon2id** (19 MiB, 2 iterations,
parallelism 1, OWASP's recommendation) with `STUDENT_AUTH_SECRET` as a server-side
**pepper** (argon2's secret input). A 6-digit PIN has only a million possibilities, so the
pepper matters: a copy of the database alone is not enough to guess PINs offline. Hashes
never leave the server, and a database constraint rejects anything that is not a hash.

`STUDENT_AUTH_SECRET` must be set once and kept: changing it invalidates every PIN and
legacy password.

### Sessions

- On success the server creates a random 256-bit token. The browser gets it in an
  **HttpOnly** cookie (`__Host-mig_student` in production: Secure, path `/`, host-only;
  **SameSite=Lax**). The database stores only its SHA-256 hash.
- Lifetime: 12 hours (15 minutes for a legacy-password session that may only set a PIN).
- Every request looks the session up, so sign-out and revocation are immediate; replaying
  an old token fails. A fresh token is issued at every sign-in (no session fixation).
- Nothing is stored in `localStorage`/`sessionStorage`.

### Throttling

`auth_throttles` counts failures per key. Keys are labelled HMACs of the student ID (or
staff email) and of the client address, never the raw values.

| Key                      | Rule                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| Student ID / staff email | 5 failures free; then 1, 5 and at most 15-minute pauses (1-hour window) |
| Network address          | 50 failures per 15 minutes → 15-minute pause                            |

- Checked on the server before any credential is verified; attempts during a pause are
  refused without being counted.
- The same pause applies to unknown IDs, with the same message, so it reveals nothing.
- Pauses are always temporary: a family is never locked out permanently.
- A successful sign-in clears the identity's failures.
- The address comes from `x-real-ip` / the first `x-forwarded-for` entry, which Vercel's
  edge sets. It is only used as hash input. The network limit is generous because a school
  or family network can share one address.
- Ordinary failed sign-ins are **not** written to the audit log (they are counted here
  instead), so the audit log cannot be flooded.

### Legacy V1 passwords

For migrated families only (imported in a later phase):

1. The V1 password is hashed at import time (same argon2id + pepper) as a separate
   credential kind, `legacy_v1_password`; plaintext never enters V2.
2. While `system_settings['auth.legacy_v1_credentials_enabled']` is `true`, the PIN field
   also accepts the short V1 password (case-insensitive, as in V1).
3. A legacy sign-in creates a **15-minute session restricted to
   `/<locale>/portal/set-pin`**: every other portal page redirects there.
4. Saving a new 6-digit PIN, in one transaction, stores the PIN, revokes the legacy
   credential for good (`migrated_to_pin`), ends every session of the student, opens a
   normal session and records a `student.pin_migrated` audit entry.
5. Setting the flag to `false` disables all legacy sign-ins immediately; remaining legacy
   credentials can later be revoked in bulk.

## Request security

- **CSRF**: every state change (sign-in, sign-out, PIN change, setup) is a Server Action.
  Next.js accepts Server Actions only as POSTs whose `Origin` matches the host, and both
  session cookies are `SameSite=Lax`, so cross-site forms cannot use them. Sign-out is
  never a GET link.
- **Session fixation**: new tokens at every sign-in and after a PIN change; Neon Auth
  issues its own session on sign-in.
- **Replay**: tokens are random, revocable and expire; only their hashes are stored.
- **Enumeration**: identical messages and timing for unknown IDs and wrong PINs; identical
  throttling.
- **Error messages**: only coarse, translated codes reach the browser; no hashes, tokens,
  IDs of other users or internal errors.
- **Rendering**: protected pages are dynamic and check the session on the server before
  rendering; `proxy.ts` redirects signed-out visitors before the page starts.
- Never logged: passwords, PINs, hashes, tokens, session IDs, connection strings.

## Audit events

| Action                                      | When                              |
| ------------------------------------------- | --------------------------------- |
| `staff.bootstrapped`                        | First Super Admin created         |
| `staff.enabled` / `staff.disabled`          | Staff status changed              |
| `staff.role_granted` / `staff.role_revoked` | Role assignment changed           |
| `student.pin_migrated`                      | Legacy password replaced by a PIN |

## Configuration

| Variable                  | Purpose                                                  | Production | Preview | Development |
| ------------------------- | -------------------------------------------------------- | :--------: | :-----: | :---------: |
| `DATABASE_URL`            | Neon pooled connection (runtime)                         |     ✓      |   ✓¹    |      ✓      |
| `DATABASE_URL_UNPOOLED`   | Neon direct connection (migrations)                      |     ✓      |   ✓¹    |      ✓      |
| `NEON_AUTH_BASE_URL`      | Neon Auth URL (Neon console → Auth → Configuration)      |     ✓      |   ✓¹    |      ✓      |
| `NEON_AUTH_COOKIE_SECRET` | Signs Neon Auth's session-data cookie (32+ random chars) |     ✓      |   ✓²    |     ✓²      |
| `STUDENT_AUTH_SECRET`     | PIN pepper and throttle-key secret (32+ random chars)    |     ✓      |   ✓²    |     ✓²      |
| `STAFF_BOOTSTRAP_TOKEN`   | One-time first Super Admin setup; remove afterwards      | temporary  |    –    |  optional   |

¹ Ideally a separate Neon branch for previews, so previews never touch production data.
² Use different values from Production.

### Neon console (Auth)

1. Project → **Auth**: enable Neon Auth for the branch used by production, with
   **email and password** sign-in.
2. Copy the **Auth URL** into `NEON_AUTH_BASE_URL`.
3. Add every origin the app is served from to Neon Auth's **trusted domains** (production
   domain; `http://localhost:3000` for local development; preview domains if staff sign-in
   is used there). Neon Auth rejects sign-ins from other origins.
4. After the first Super Admin exists, disable open sign-up in Neon Auth if the console
   offers that option (sign-ups would not grant access anyway, but fewer accounts is better).

## Tests

- `src/server/student-auth/student-auth.test.ts`: every student case (permanent ID, alias,
  wrong/malformed PIN, unknown ID, disabled student, throttling and escalation, reset after
  success, network throttling, expiry, revocation, replay, fixation, legacy enable/disable,
  forced migration, post-migration rejection, storage format, pepper).
- `src/server/staff-auth/staff-auth.test.ts`: bootstrap (once only), every session state,
  no email matching, inactive staff, permission checks, grants/denials, Super Admin,
  direct-call rejection, safe error text, staff-management rules and audit.
- `src/proxy.test.ts`: route protection in the proxy.

All run against real migrations in PGlite. The staff flow against a real Neon Auth instance
can only be verified once Neon Auth is configured (see the report for Phase 3).
