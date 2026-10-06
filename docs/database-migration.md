# Database migration: V1 Firestore → V2 PostgreSQL

Status: **plan**. The PostgreSQL schema is designed in Phase 2, and the import tooling
is built in Phase 10. This document fixes the constraints both must satisfy.

## Ground rules

- The V1 Firebase project `ginna-b79aa` is **read-only** to this effort. Never delete
  or modify it. Export from it; never write back.
- Export with read-only credentials into files, then import from those files. The
  import is repeatable, can be dry-run, and runs against a non-production database
  first.
- Every existing student ID is preserved **exactly**, including IDs that only survive
  inside V1 promotion history.
- No ID is ever reissued: the V2 ID allocator starts above the highest serial seen for
  each level/year, counting historical IDs too.
- V1 plaintext passwords are never copied as plaintext into V2. They are either hashed
  during import or discarded in favour of newly issued PINs (open decision below).

## Source model (V1)

See [`legacy-v1.md`](legacy-v1.md#v1-firestore-data-model-for-migration) for the full
Firestore layout. Summary: `students/{matricId}` with `results` and `history`
subcollections, `classes/{level}` and `settings/global` publication flags,
`counters/{YEAR}-{CODE}`, `admins/{uid}`.

## Mapping outline

| V1 source                          | V2 destination (indicative; finalised in Phase 2)                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `students/{id}`                    | one `students` row (permanent identity) + one `enrollments` row for the student's `class` and `year`                  |
| `students/{id}.year`               | academic session for that enrolment (V1 only knew a calendar year; mapping to e.g. `2025/2026` is a decision below)   |
| `students/{id}.fee`                | a fee charge for that enrolment                                                                                       |
| `students/{id}.paid`               | one **opening-balance payment** record marked as migrated (V1 has no payment dates or history)                        |
| `students/{id}/results/{subject}`  | result scores linked to the enrolment and a term (V1 had no terms; see decisions), matched to subject records by name |
| `students/{newId}/history/{oldId}` | an earlier enrolment of the **same** student; `oldId` kept as a student ID alias so the old ID remains traceable      |
| `classes/*`, `settings/global`     | publication settings for the migrated session/term                                                                    |
| `counters/*`                       | not imported; ID allocation is recomputed from all known IDs                                                          |
| `admins/{uid}`                     | not imported automatically; staff accounts are re-created in Neon Auth with explicit roles                            |

## Data quality checks the import must report

- Subjects that do not match the curriculum lists (V1 "Quick Add" allowed free text).
- Scores outside 0–40 (CA) or 0–60 (exam), or results stored as `0`/`F` for blank entries.
- `paid` greater than `fee`, negative or non-numeric amounts.
- IDs that do not match `MG(IBT|IDA|THA)-YYYY-NNN`.
- The same serial used by two different people (possible in V1 after deletions).
- Students whose class does not match their ID's class code (V1 allowed editing class
  without changing the ID).

## Open decisions (need the school's input)

1. **Promoted students' primary ID.** V1 issued a new ID on promotion. Should the
   permanent V2 ID be the student's _first_ ID or their _latest_ one? (The other is kept
   as an alias either way.)
2. **Existing passwords.** Hash the existing 3-letter passwords so families can keep
   using them for a transition period, or issue new PINs to every family at launch?
3. **Session mapping.** Which academic session (e.g. `2025/2026`) does V1 `year: 2025`
   correspond to, and which term should migrated results belong to?
