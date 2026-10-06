# Legacy V1 ("First Edition") reference

V1 was a three-file static app (`index.html`, `script.js`, `styles.css`) that talked
directly to Firebase (Auth + Firestore, project `ginna-b79aa`) from the browser.

The V1 source has been removed from the working tree as part of the V2 rebuild.
It remains in Git history and is tagged:

```
git show v1-first-edition:script.js
git checkout v1-first-edition -- index.html script.js styles.css   # to inspect locally
```

**Do not delete or modify the `ginna-b79aa` Firebase project.** It may hold real
student records that V2 will migrate (see [`database-migration.md`](./database-migration.md)).

This document records the verified business rules V2 must preserve, and the V1
behaviours V2 deliberately does **not** carry over.

## Business rules to preserve

### Levels (classes)

| Value (V1 key) | Label       | Meaning  | ID code |
| -------------- | ----------- | -------- | ------- |
| `Ibtidaiyah`   | Ibtidā'iyah | Beginner | `IBT`   |
| `Idadiyah`     | Idādiyah    | Middle   | `IDA`   |
| `Thanawiyah`   | Thanāwiyah  | Senior   | `THA`   |

Progression: Ibtidā'iyah → Idādiyah → Thanāwiyah → (V2 adds) Graduated.

### Student IDs

Format `MG{CLASS_CODE}-{YEAR}-{SERIAL}`, serial zero-padded to 3 digits.
Examples: `MGIBT-2025-001`, `MGIDA-2025-014`, `MGTHA-2025-007`.

Existing IDs must be preserved exactly. V1 could **recycle** IDs (it derived the
next serial from the highest _existing_ student document, so deleting or promoting
a student freed their serial). V2 must never recycle an ID.

V1 also issued a **new** ID when a student was promoted. V2 keeps one permanent
identity per student; V1 IDs held in promotion history must be kept as aliases
during migration.

### Subjects (curriculum order)

| Ibtidā'iyah | Idādiyah     | Thanāwiyah    |
| ----------- | ------------ | ------------- |
| Tajweed     | Tajweed II   | Tafsir III    |
| Arabic      | Arabic II    | Balagha III   |
| Qur'an      | Qur'an II    | Qur'an III    |
| Hadith      | Hadith II    | Hadith III    |
| Fiqh        | Fiqh II      | Fiqh III      |
| Akhlaq      | Akhlaq II    | Seerah III    |
| Nahwu       | Nahwu II     | Nahwu III     |
| Sarf        | Sarf II      | Sarf III      |
| Dictation   | Dictation II | Dictation III |
| Reading     | Reading II   | Reading III   |

The order above is the curriculum order (V1 displayed results alphabetically; V2
must not). V1 "Quick Add" also allowed free-text subject names, so migrated data
may contain subjects outside these lists.

### Scoring and grading

- Continuous assessment (CA): 0–40. Exam: 0–60. Total: 0–100.
- Grades: A 70–100 · B 60–69 · C 50–59 · D 45–49 · E 40–44 · F below 40.

### Result publication

Results are visible to a student only when **both** a global switch and the
student's class switch are published. (V1 enforced this only in the browser.)

### Fees

Each student has a fee amount in Naira (₦); status is derived:
`PAID` (outstanding = 0), `PARTIAL` (some paid), `UNPAID` (nothing paid).

### Positions

Students are ranked within their class by the sum of their subject totals and
shown as ordinals (1st, 2nd, 3rd…).

## V1 behaviours V2 intentionally does not keep

- Student passwords stored and compared in plaintext, in the browser, and printed
  on receipts.
- Unrestricted client-side reads of student records.
- Blank scores saved as `0` / `F`; no server-side score validation.
- A single overwritable `paid` number instead of a payment ledger.
- Promotion that deletes the old record and carries the previous year's balance.
- Ties ranked as different positions; students without results ranked.
- No academic sessions or terms (results were overwritten each time).
- Every administrator could do everything; no audit trail.

## V1 Firestore data model (for migration)

```
students/{matricId}         id, name, class, fee, paid, password, year, position,
                            createdAt, updatedAt
  results/{subjectName}     subject, ca, exam, total, grade, date (en-NG string),
                            recordedAt
  history/{oldMatricId}     snapshot of the pre-promotion student document
    results/{subjectName}   snapshot of the pre-promotion results
classes/{classValue}        resultsPublished
settings/global             resultsPublished
counters/{YEAR}-{CODE}      next                       (written, never read by V1)
admins/{uid}                active, ...
```
