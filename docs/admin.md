# Administration (staff workspace)

The staff workspace lives under `/<locale>/admin`. Every page checks the staff session
and its own permission on the server; navigation and buttons are hidden when a
permission is missing, but hiding is never the check.

## Screens

| Route                                         | Purpose                                                        | Permission                                     |
| --------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `/admin`                                      | Dashboard from live counts                                     | any active staff (`students.read` for figures) |
| `/admin/students`                             | Directory: search by name or any registered ID, filters, pages | `students.read`                                |
| `/admin/students/new`                         | Register a student (issues the permanent ID)                   | `students.create`                              |
| `/admin/students/[id]`                        | Profile: identity, IDs, placement, guardians, sign-in facts    | `students.read`                                |
| `/admin/students/[id]/edit`                   | Edit personal details                                          | `students.update`                              |
| `/admin/students/[id]/status`                 | Change status, or restore an archived student                  | `students.archive`                             |
| `/admin/students/[id]/placement`              | Place in a class, or correct the level                         | `enrollments.manage`                           |
| `/admin/students/[id]/guardians/new`          | Link an existing guardian or add a new one                     | `students.update`                              |
| `/admin/students/[id]/guardians/[guardianId]` | Edit a guardian, or remove them from this student              | `students.update`                              |
| `/admin/academics`                            | Sessions, new session, levels                                  | `students.read` or `sessions.manage`           |
| `/admin/academics/sessions/[sessionId]`       | Session dates, activation/closing, terms                       | view as above; changes `sessions.manage`       |
| `/admin/account`                              | Own name, roles and permissions                                | any active staff                               |

Activity on a profile is shown to staff with `audit.read`.

## How a change happens

Browser form → Server Action (`src/server/admin/actions.ts`) → service
(`src/server/admin/*.ts`):

1. The action re-verifies the Neon Auth session and the specific permission
   (`runAdminAction` → `authorizeStaffAction`). Signed-out callers go to sign-in.
2. Every field is validated on the server (`src/domain/admin-input.ts`); errors return as
   codes translated on the page, and the form is refilled.
3. The service checks the permission again, runs in one transaction attributed to the
   staff member (`setTransactionActor`), applies the business rules and writes the audit
   entry in the same transaction.
4. On success the action redirects with a `?done=` code shown as a confirmation.

Business-rule refusals (`AdminRuleError`) carry only a code, never data.

## Rules

**Registration.** The permanent ID is `MG{admission level}-{admission session start
year}-{serial}`, allocated by `allocateStudentId()` in the same transaction as the
student, its primary identifier, the optional first placement and the optional guardian.
A refused registration rolls back completely and consumes no serial. A session must exist
first, because the ID contains its year.

**Lifecycle** (`src/domain/student-lifecycle.ts`). By hand: active → suspended, withdrawn,
archived; suspended → active, withdrawn, archived; withdrawn → active (readmit), archived;
graduated → archived. Graduation happens only through promotion (a later phase). Each
change needs a reason and a confirmation tick. Leaving (withdrawn, archived) ends the
current placement as `withdrawn`; any status other than active revokes open portal
sessions. Coming back (readmission, or restoring to active or suspended) reopens the
placement the student left if its session is still open, because a student has only one
enrollment per session; otherwise the student is placed again. The withdrawal stays in
the audit log. Archived records are read-only and hidden from the default directory; restoring
returns the student to the status they had before archiving. Students are never deleted.

**Placement.** One enrollment per student per session and at most one current
enrollment. A student can be placed only while active and without a current placement, in
a planned or current session. A wrong level can be corrected (with a reason) until results
exist for that enrollment; moving up a level is promotion.

**Guardians.** Details belong to the guardian and are shared by every linked student (the
edit screen says how many); relationship and primary contact belong to each link, and a
student has at most one primary contact. A new guardian with exactly the same name and
phone number as an existing one reuses that record. Removing a guardian only unlinks them
from that student; the guardian record stays.

**Sessions and terms** (`src/domain/academic-calendar.ts`). A new session gets First,
Second and Third terms and the default grading policy. planned → current → closed; only one
session and one term are current. Activating a term closes the previous current term.
Closing a session requires that none of its enrollments is still current (that is the job
of promotion), and closes its current term. Term dates must fall inside the session dates.

## Audit events added

| Action                                            | Target   | Metadata                                         |
| ------------------------------------------------- | -------- | ------------------------------------------------ |
| `student.created`                                 | student  | public ID, admission level and session           |
| `student.updated`                                 | student  | changed fields with previous and new values      |
| `student.status_changed`                          | student  | from, to, reason, ended enrollment, `restored`   |
| `enrollment.created`                              | student  | enrollment, session, level                       |
| `enrollment.level_changed`                        | student  | enrollment, session, from, to, reason            |
| `guardian.created`                                | guardian | name                                             |
| `guardian.updated`                                | guardian | changed fields with previous and new values      |
| `guardian.linked`                                 | student  | guardian, relationship, primary, reused existing |
| `guardian.link_updated`                           | student  | guardian, changes                                |
| `guardian.unlinked`                               | student  | guardian, previous relationship, reason          |
| `session.created`                                 | session  | label, dates, terms                              |
| `session.updated`                                 | session  | changed dates                                    |
| `session.activated` / `session.closed`            | session  | label, closed terms                              |
| `term.activated` / `term.closed` / `term.updated` | term     | session, term, closed terms or changes           |

## Not in this phase

Issuing or resetting student PINs, promotion and graduation, results, fees, reports,
staff management screens, level/subject editing and a full audit-log viewer.
