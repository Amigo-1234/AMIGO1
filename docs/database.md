# Database

PostgreSQL on [Neon](https://neon.tech), accessed through [Drizzle ORM](https://orm.drizzle.team)
with the `node-postgres` driver. The schema lives in `src/db/schema/`; migrations in
`drizzle/`.

## Conventions

| Topic        | Rule                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keys         | Internal UUID primary keys (`gen_random_uuid()`). Human-facing codes (student IDs, subject codes, receipt numbers) are separate unique columns. Append-only logs use bigint identity. |
| Naming       | `snake_case` tables and columns (Drizzle `casing: "snake_case"` maps from camelCase TypeScript).                                                                                      |
| Time         | `timestamptz` for instants (`created_at`, `updated_at`, ...); `date` for calendar dates (`paid_on`, `date_of_birth`). `updated_at` is set by trigger.                                 |
| Money        | Whole **kobo** in `bigint` columns (`amount_kobo`; ₦1 = 100 kobo). Exact integer arithmetic, always positive; direction comes from the table.                                         |
| Deletion     | Every foreign key is `ON DELETE RESTRICT`. Important tables also reject `DELETE`/`TRUNCATE` by trigger. Records are archived, voided or revoked instead.                              |
| Enumerations | PostgreSQL enums for small fixed sets (statuses, methods). Display names live in the translation dictionaries.                                                                        |
| JSON         | Only where data is genuinely open-ended: audit `metadata`, `system_settings.value`, migration summaries/issue details.                                                                |
| Provenance   | Tables that can hold imported V1 data carry `source` (`v2` or `v1_import`).                                                                                                           |

## Tables by area

**Academic structure.** `levels` (code, bilingual names, `sort_order`, `next_level_id`: null
means students graduate), `subjects` (stable `code`, bilingual names), `level_subjects`
(curriculum and display order per level), `grading_policies` + `grade_bands`,
`academic_sessions` (`start_year`, generated `label` such as `2025/2026`, status, grading
policy), `term_types` (first, second, third, legacy) and `terms` (a session's terms).

**Students.** `students` (UUID identity, permanent `public_id`, name, status, optional
personal fields), `student_identifiers` (registry of every ID ever issued or imported),
`student_id_counters`, `guardians` + `student_guardians` (optional), `enrollments` (student ×
session × level, with outcome status).

**Results.** `term_results` (one sheet per enrollment and term), `result_scores` (CA, exam,
generated total per subject), `result_score_revisions` (every change), `result_publications`.

**Finance.** `fee_structures` (standard fee per session/level/optional term), `fee_charges`
(what a student owes), `payments` (what was paid), `document_counters` (receipt numbering).

**Promotion.** `promotion_batches`, `promotions` (one decision per enrollment).

**Staff and access.** `staff_users` (linked to Neon Auth by `auth_user_id`), `roles`,
`permissions`, `role_permissions`, `user_roles`, `user_permission_overrides`.

**Student sign-in.** `student_credentials`, `student_sessions`, `auth_throttles`.

**Operations.** `audit_logs`, `system_settings`, `migration_runs`, `legacy_record_map`,
`migration_issues`.

## Key rules

### Student identity and IDs

- The UUID `students.id` is the true key. `public_id` is the Markaz ID (`MGIBT-2025-001`)
  and **never changes**, including on promotion. Level, class and session belong to
  enrollments, never to the student or the ID.
- `student_identifiers` holds every ID ever used: each student's primary ID and any earlier
  V1 IDs as aliases. `value` is the primary key and rows can never be updated or deleted,
  so an ID or alias can never be given to anyone else.
- The student's `public_id` must be their primary registry entry (deferred composite foreign
  key plus constraint triggers), so the student row and its identifier are inserted in one
  transaction, in either order.
- New IDs come from `allocateStudentId()` (`src/db/student-ids.ts`): one above both the
  counter and the highest registered serial for that level code and year (aliases included).
  The counter row lock serialises concurrent registrations; a rolled-back registration rolls
  back its counter too, so no serial is skipped and none is ever issued twice.
- V2 IDs must match `^MG[A-Z]{2,5}-[0-9]{4}-[0-9]{3,}$`. Imported V1 IDs are preserved exactly,
  even when malformed (`source = 'v1_import'`); the import reports them.
- New IDs use the level of admission and the **start year of the admission session**
  (admitted in 2026/2027 → `…-2026-…`).

### Enrollments

One enrollment per student per session (`UNIQUE (student_id, session_id)`) and at most one
`active` enrollment per student. When a session ends, an enrollment becomes `promoted`,
`repeated`, `graduated` or `withdrawn`. The student's current class is their active
enrollment's level.

### Results

- Path: **Student → Enrollment → Session → Term → Subject**. `term_results` carries the
  session explicitly, and composite foreign keys require both the enrollment and the term to
  belong to it.
- `result_scores.ca` / `exam` are nullable: **blank means not entered** and is never treated
  as 0. `total` is generated by PostgreSQL and is NULL until both parts exist. Grades are
  derived from the session's grading policy when read, not stored.
- A trigger enforces the policy's maximums (CA ≤ 40, exam ≤ 60 by default), rejects changes
  on finalized sheets, and copies every insert and change into `result_score_revisions`
  with the acting staff member and reason (see [Transactions](#transactions-and-the-acting-user)).
- `result_publications`: per term, one school-wide row (`level_id` NULL, at most one thanks
  to `UNIQUE NULLS NOT DISTINCT`) and one row per level. Results for a level may be served
  to families only when both rows are published. The server enforces this when reading.

### Grading policies

Default policy: CA 40 + exam 60 = 100; A 70–100, B 60–69, C 50–59, D 45–49, E 40–44, F 0–39.
Each session references one policy. When a session using a policy leaves `planned`, the
policy is locked by trigger: its maximums and bands can no longer change, so historical
grades never shift. Future changes are new policies.

### Fees and payments

- `fee_structures` define the standard fee; `fee_charges` record what each enrollment owes
  (they can differ per student, e.g. a discount); `payments` record money received with
  receipt number, date, method, reference, notes, recorder and timestamp.
- **Outstanding = Σ posted charges − Σ posted payments** for the enrollment. Status is
  derived: PAID (outstanding ≤ 0), PARTIAL (something paid), UNPAID (nothing paid).
- Charges and payments are **void-only**: the single permitted update sets
  `status = 'voided'` with `voided_at` and a `void_reason`; every other value is frozen.
  A correction is a new row (`replaces_payment_id` links it). Rows cannot be deleted.
- Balances belong to an enrollment, so a previous session's balance never carries forward
  by accident; carrying arrears requires an explicit charge.
- V2 payments must have a receipt number, date, method and recorder. Imported V1 data may
  omit them (V1 kept only one "amount paid" figure, with no dates).

### Promotion

`promotions` records the outcome of each enrollment exactly once (`UNIQUE
(from_enrollment_id)`): `promoted` or `repeated` (with the new enrollment it created) or
`graduated` (none, enforced by check). Rows are immutable. The workflow itself (Phase 9) runs
in one transaction: close the old enrollment, create the new one, record the promotion,
write the audit entry.

### Staff permissions

Authorisation checks permission keys (`payments.record`), never role names. Effective
permissions = union of the user's roles' permissions + individual grants − individual
denials (`resolvePermissions()` in `src/domain/permissions.ts`). Seeded roles: Super Admin
(everything), Registrar, Academic Admin, Finance Admin. Staff passwords are held by Neon Auth,
never in these tables.

### Student and parent credentials

- `student_credentials.secret_hash` must look like a PHC password-hash string
  (`$argon2id$…`); a check constraint rejects anything shorter or without that shape, so
  plaintext cannot be stored by mistake. Hashes can never be edited, only revoked.
- `kind = 'pin'`: the 6-digit PIN. `kind = 'legacy_v1_password'`: a migrated family's V1
  password, hashed during import. At most one unrevoked credential of each kind per student.
- Legacy flow (implemented in Phase 3): a successful legacy sign-in creates a session with
  `must_set_pin = true` that can only set a new PIN; setting it revokes the legacy
  credential. `system_settings['auth.legacy_v1_credentials_enabled']` switches all legacy
  sign-ins off, and remaining legacy credentials can be revoked in bulk.
- `student_sessions` stores only a SHA-256 hash of the session token. `auth_throttles`
  tracks failures by hashed keys (student ID, IP) for rate limiting and lockout.

### First Super Admin marker

`system_settings['auth.staff_bootstrap']` is written by the one-time Super Admin setup and
permanently disables it (see [`authentication.md`](authentication.md#first-super-admin-one-time-bootstrap)).

### Audit log

`audit_logs` is append-only (no update, delete or truncate). Each entry records the actor
(staff, student or system, with a consistency check), a dotted `action`
(`payment.voided`), the target, `metadata` and a timestamp. Indexed for "recent activity",
"history of this record", "actions by this person" and "all actions of this kind".

## Integrity safeguards

Migration `drizzle/0001_integrity_safeguards.sql` installs the triggers referred to above:

| Safeguard                                       | Tables                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `updated_at` maintained                         | every table with `updated_at`                                                                                                            |
| No DELETE / TRUNCATE                            | sessions, terms, students, identifiers, enrollments, results, publications, ledgers, promotions, credentials, audit and migration tables |
| Append-only (no UPDATE)                         | `student_identifiers`, `result_score_revisions`, `promotions`, `audit_logs`, `legacy_record_map`                                         |
| Immutable public ID, registered as primary      | `students`, `student_identifiers`                                                                                                        |
| Void-only updates                               | `fee_charges`, `payments`                                                                                                                |
| Hash immutable, revoke once                     | `student_credentials`                                                                                                                    |
| Policy maxima, finalized lock, revision history | `result_scores`                                                                                                                          |
| Policy locks when in use                        | `grading_policies`, `grade_bands`                                                                                                        |

These are the last line of defence. Server code still validates everything first and
returns friendly errors; the database guarantees the rules even if code is wrong.

## Access patterns and indexes

| Need                               | Index                                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Sign in / look up by any ID        | `student_identifiers` primary key                                  |
| Students' IDs                      | `student_identifiers (student_id)`                                 |
| Search by name                     | `students (lower(full_name))`                                      |
| Class list for a session and level | `enrollments (session_id, level_id, status)`                       |
| A student's history                | `enrollments (student_id, session_id)` unique                      |
| Result sheets for a term (ranking) | `term_results (term_id)`; scores by `(term_result_id, subject_id)` |
| A student's ledger                 | `fee_charges (enrollment_id)`, `payments (enrollment_id)`          |
| Recent payments / by date          | `payments (created_at DESC)`, `payments (paid_on)`                 |
| Audit views                        | `audit_logs` by time, target, actor and action                     |

## Transactions and the acting user

Multi-step workflows (registration, promotion, payment correction, PIN change) run in
`db.transaction(...)`. At the start of a transaction, call
`setTransactionActor(tx, { actorId, reason })` (`src/db/actor.ts`). It sets the
transaction-local settings `app.actor_id` and `app.change_reason` that triggers use for
attribution. Being transaction-local, they cannot leak to another request sharing the pooled
connection.

## Working with migrations

```bash
npm run db:generate        # after editing src/db/schema: generate a new SQL migration
npx drizzle-kit generate --custom --name <name>   # hand-written SQL (triggers, functions)
npm run db:check           # verify migration history consistency
npm run db:migrate         # apply pending migrations (uses DATABASE_URL_UNPOOLED)
npm run db:seed            # insert missing structural defaults (idempotent)
```

- Never edit a migration that has been applied anywhere; add a new one.
- Review generated SQL before committing; it is part of the code review.
- Migrations run all-or-nothing in one transaction.
- Neon branches are a cheap way to test a migration against a copy of production first.

## Seed data

`seedDatabase()` (`src/db/seed/index.ts`) inserts only structural, non-sensitive defaults:
term types, the three levels and their promotion order, the 30 V1 subjects in curriculum
order, the default grading policy, the permission catalogue, the four system roles and the
legacy-credential setting. It never creates people, credentials or money records, and it
never overwrites changes administrators have made. Super Admin always receives every
permission in the catalogue.

Arabic level and subject names in `src/domain/curriculum.ts` are initial translations and
should be reviewed by the school.

## Testing

`src/db/database.test.ts` applies every migration and the seed to PGlite (PostgreSQL compiled
to WebAssembly, in memory) and attempts to break each rule above. It needs no database server
or credentials, so it runs with `npm test` everywhere.

## Not yet modelled (by design)

- **Class sections/arms** within a level (e.g. Ibtidā'iyah A and B): add a `sections` table
  and a nullable `enrollments.section_id` when needed.
- **Snapshotting positions at publication**: positions are computed from scores when read;
  freezing them at publication can be added in Phase 6 if required.
