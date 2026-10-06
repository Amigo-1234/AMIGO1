# Database migration: V1 Firestore → V2 PostgreSQL

Status: the **V2 schema is ready** for the import (Phase 2). The import tooling itself is
built in Phase 10; no production Firebase data has been migrated. This document fixes the
rules the import must follow. Table details are in [`database.md`](database.md).

## Ground rules

- The V1 Firebase project `ginna-b79aa` is **read-only** to this effort. Never delete or
  modify it. Export from it; never write back.
- Export with read-only credentials into files, then import from those files. The import is
  repeatable (`legacy_record_map` makes re-runs idempotent), supports dry runs
  (`migration_runs.dry_run`), and runs against a non-production database (or Neon branch)
  first.
- Every V1 ID is preserved **exactly**, including IDs that only survive inside V1 promotion
  history, and none is ever reissued (see [Student IDs](#student-ids)).
- V1 passwords are never stored as plaintext in V2 (see [Credentials](#credentials)).

## Decisions

| Topic               | Decision                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student key         | Internal UUID is the true primary key.                                                                                                                                                                  |
| Public ID           | A migrated student's **latest** V1 ID becomes their permanent public Markaz ID.                                                                                                                         |
| Earlier IDs         | Every earlier V1 ID is kept as an alias of the same student, and can never be assigned to anyone else.                                                                                                  |
| IDs after migration | Promotion no longer changes a student's public ID. Level, class and session belong to enrollments.                                                                                                      |
| PIN                 | V2 uses a 6-digit numeric PIN, stored only as a strong password hash, verified on the server, with rate limiting and lockout.                                                                           |
| V1 passwords        | Hashed during import as temporary `legacy_v1_password` credentials. A successful legacy sign-in must set a new PIN, which revokes the legacy credential. Legacy sign-in can be switched off globally.   |
| V1 `year`           | `year: 2025` means academic session **2025/2026** (session start year).                                                                                                                                 |
| V1 terms            | V1 has no trustworthy term. Imported results go into each session's **Legacy (term not recorded)** term. No First/Second/Third term is invented. A result sheet can later be moved to its correct term. |

## Source model (V1)

See [`legacy-v1.md`](legacy-v1.md#v1-firestore-data-model-for-migration). Summary:
`students/{matricId}` with `results` and `history` subcollections, `classes/{level}` and
`settings/global` publication flags, `counters/{YEAR}-{CODE}`, `admins/{uid}`.

## Mapping

| V1 source                                            | V2 destination                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `students/{id}` (current document)                   | `students` row (`source = 'v1_import'`, `public_id = id`) + primary `student_identifiers` row                                                                                               |
| `students/{newId}/history/{oldId}`                   | the same student: `oldId` as a non-primary `student_identifiers` alias, plus an earlier `enrollments` row with `legacy_student_id = oldId`                                                  |
| `class` + `year` (current and each history snapshot) | `enrollments` (level by V1 class key, session with `start_year = year`); the current one `active` only if that session is the active session                                                |
| `year`                                               | `academic_sessions` for that start year (created by the import if missing, status `closed` unless it is the current session)                                                                |
| results (current and history)                        | `term_results` in that session's **legacy** term + `result_scores` matched to subjects by name within the level; unknown subjects are created as inactive `v1_import` subjects and reported |
| `fee`                                                | one `fee_charges` row on the matching enrollment (`source = 'v1_import'`)                                                                                                                   |
| `paid`                                               | one `payments` row (`source = 'v1_import'`, no receipt number, no date) when greater than 0                                                                                                 |
| `password`                                           | `student_credentials` (`kind = 'legacy_v1_password'`), hashed with the same algorithm as PINs; the plaintext is discarded after hashing                                                     |
| `position`                                           | not imported; positions are recomputed from scores                                                                                                                                          |
| `classes/*`, `settings/global`                       | `result_publications` rows for the imported legacy terms                                                                                                                                    |
| `counters/*`                                         | not imported; allocation uses the registry, which already holds every imported ID                                                                                                           |
| `admins/{uid}`                                       | not imported; staff accounts are created in Neon Auth with explicit roles                                                                                                                   |

### Student IDs

Imported IDs are written to `student_identifiers` with their parsed level code, year and
serial. Because new IDs are allocated above the highest registered serial for each level
code and year, no V1 ID (current or alias) can be reissued. V1 IDs that do not match the
official format are still preserved exactly (`source = 'v1_import'` relaxes the format check)
and reported for review.

### Credentials

Each V1 password is hashed during the import, and only the hash is stored. If a V1 password
is empty, no legacy credential is created and the family needs a PIN issued by the school.
The import must hash on the machine running it and never log or write plaintext anywhere.

### Scores

V1 stored blanks as `0` with grade `F` when an admin pressed "Save All". The import keeps the
numbers as V1 stored them (it cannot know which zeros were blanks) and reports sheets where
every score is 0 for review. Scores above the V2 maximums are reported and not imported.

## Data-quality checks the import must report

Findings go to `migration_issues` with a severity, code and source path:

- subjects that do not match the curriculum lists (V1 "Quick Add" allowed free text)
- scores outside 0–40 (CA) or 0–60 (exam); sheets where every score is 0
- `paid` greater than `fee`, negative or non-numeric amounts
- IDs that do not match `MG(IBT|IDA|THA)-YYYY-NNN`
- the same ID appearing as two different people (possible in V1 after deletions)
- students whose class does not match their ID's class code (V1 allowed editing the class
  without changing the ID)
- students with no password (they need a PIN issued)

## Running it (Phase 10)

1. Export Firestore with read-only credentials to local files.
2. `--dry-run` against a Neon branch; review `migration_issues`.
3. Fix data questions with the school; repeat until clean.
4. Run for real against the branch, verify totals (students, IDs, results, fee totals),
   then against production during a quiet window.
5. Keep the export files and the run summary; the Firebase project stays untouched.
