# Architecture

## Principles

1. **The server is the only gatekeeper.** The browser never talks to the database.
   Every read of student data and every write goes through server code (Server
   Components, Server Actions, Route Handlers) that authenticates the caller, checks a
   permission and validates input.
2. **History is append-only.** Results, payments, enrolments and promotions are never
   silently overwritten or deleted; corrections are new records (void, reverse, archive).
3. **Families get simplicity, staff get capability.** The student/parent portal is a
   handful of screens; the admin system carries the complexity.
4. **Light on the network.** Pages are server-rendered and mostly static HTML; client
   JavaScript is used only where interaction needs it. No large UI kits.
5. **Business rules live in plain, tested TypeScript modules**, separate from React and
   from the database layer, so they can be unit-tested and reused by migrations.

## Project structure

```
src/
  app/                    Next.js App Router
    [locale]/             Every page lives under /en or /ar (root layout sets lang/dir)
      page.tsx            Public landing page
      portal/login/       Student / parent sign-in
      staff/login/        Staff sign-in
      not-found.tsx       Localized 404 ([...rest] catch-all routes unmatched URLs here)
    fonts.ts              next/font declarations
    globals.css           Design tokens (Tailwind @theme) and base styles
    icon.svg              App icon
  components/
    ui/                   Generic primitives: Button, TextField, Card, Badge, Notice
    admin/                Admin shell, navigation, form controls and page parts
    brand/                Mark, lockup, geometric pattern, arch, ornament
    layout/               Site header/footer, auth shell, language switcher, skip link
    icons/                Inline SVG icons
  i18n/
    config.ts             Locales, direction, Intl locale, negotiation
    dictionaries/         en.ts defines the shape; ar.ts must match it
    format.ts             interpolate(), Naira/number/date formatting
    paths.ts              Localized hrefs, language switching
    server.ts             getLocale()/getDictionary() for Server Components
  domain/                 Pure business rules (no React, no database): student IDs,
                          grading policy, curriculum defaults, permissions
  db/
    schema/               Drizzle table definitions by area (see docs/database.md)
    client.ts             Server-only database handle (node-postgres pool, lazy)
    actor.ts              Transaction-local acting user for audit triggers
    student-ids.ts        Never-recycled student ID allocation
    seed/                 Idempotent structural seed
    scripts/              db:migrate / db:seed entry points
    testing/              PGlite test database and fixtures
  server/                 Server-only application logic
    auth/                 Credential hashing, keyed hashes, sign-in throttling
    staff-auth/           Neon Auth integration, staff access, permissions, bootstrap
    admin/                Staff workspace services, read models and Server Actions
    student-auth/         Student ID + PIN sign-in, sessions, legacy PIN migration
    audit.ts              Audit log writer
  lib/                    Framework-free helpers (env, geometry, brand constants)
  proxy.ts                Locale redirect, Neon Auth session refresh, portal guard
drizzle/                  SQL migrations (generated + hand-written safeguards)
docs/                     Project documentation
```

Authenticated areas: `/<locale>/portal/...` (students and parents) and
`/<locale>/admin/...` (staff). See [`authentication.md`](authentication.md) and, for the
staff workspace, [`admin.md`](admin.md).

## Internationalisation

- Locales: `en` (LTR) and `ar` (RTL). URLs are always prefixed: `/en/...`, `/ar/...`.
- `src/proxy.ts` redirects un-prefixed URLs. Order of preference: the `mig_locale`
  cookie (last language the visitor used), then the `Accept-Language` header by quality,
  then English. Visiting a prefixed URL updates the cookie.
- The root layout lives in `app/[locale]/layout.tsx` and renders
  `<html lang dir>` from the locale, so the whole document flips direction.
- Strings live in typed dictionaries. `en.ts` defines the shape; `ar.ts` is typed as
  `Dictionary`, so a missing or extra key is a compile error. Tests also check that
  every Arabic string is non-empty, written in Arabic and uses the same `{placeholders}`.
- Translations are read on the server (`getDictionary()` via `next/root-params`), so
  dictionaries add nothing to the client bundle. Client components receive only the
  strings they need as props.
- Layout uses logical properties (`ms-`, `pe-`, `start-`, `border-s`, `text-start`), so
  components mirror automatically. Direction-bearing icons use `rtl:-scale-x-100`.
- Data entry that is inherently Latin (student IDs, PINs, emails) stays `dir="ltr"`
  inside Arabic pages.
- Free text people type (names, addresses, notes, reasons) uses the `user-text` utility
  (`unicode-bidi: plaintext`) when shown and `dir="auto"` when typed, so Latin text inside
  an Arabic page, or Arabic inside an English page, keeps its own reading order.
- Numbers, Naira amounts and dates use `Intl` with `en-NG` and `ar-u-nu-latn` (Arabic
  text with Western digits, so IDs, scores and money read the same in both languages),
  in the `Africa/Lagos` time zone.
- Proper nouns are never translated: the school's name appears in both scripts, each
  marked with its own `lang` so it gets the correct font and shaping.

## Design system

- **Palette** (`globals.css`): Tailwind's default colours are cleared; only the brand
  palette exists. Deep emerald (`brand-*`) is primary; ivory is the page; sand and stone
  are surfaces and neutrals; charcoal is text; gold (`gold-*`) is ornament and accent
  only, never body text. Text pairs meet WCAG AA.
- **Type**: Manrope (Latin) and Noto Kufi Arabic (Arabic), both variable fonts
  self-hosted by `next/font`. Any element with `lang="ar"` uses the Arabic face; Arabic
  pages get a taller line height.
- **Shape**: small radii (2–8px), hairline borders, near-flat shadows. No glass,
  gradients, glows or pill-shaped buttons.
- **Ornament**: khatam star, star-and-cross lattice, pointed arch and a fine divider,
  generated from `src/lib/geometry.ts` as inline SVG (no images, no client JS). Used on
  the landing page, sign-in screens, empty states and print documents only, never
  across data-heavy admin screens.
- **Accessibility**: semantic landmarks, a skip link, labelled inputs with
  `aria-describedby` hints and errors, visible focus outlines, 44px+ touch targets,
  16px inputs (no iOS zoom), and a reduced-motion override.

## Data layer

PostgreSQL (Neon) through Drizzle ORM; full design in [`database.md`](database.md). In short:
UUID keys with separate human-facing codes, money in integer kobo, append-only or void-only
history for results, payments, identifiers and the audit log, and rules enforced by
constraints and triggers as well as by server code. The browser never connects to the
database: all access goes through server code using `getDb()` from `src/db/client.ts`
(server-only).

## Security baseline

Present now: security headers on every response (`next.config.ts`), no
`X-Powered-By`, server-only environment access (`src/lib/env.ts` imports
`server-only`), React's escaping for all rendered text (no raw HTML insertion).

Since Phase 3 ([`authentication.md`](authentication.md)): staff sign-in via Neon Auth with
explicit staff-record mapping; student/parent sign-in with argon2id-hashed, peppered PINs
verified on the server; server-side sessions in HttpOnly SameSite cookies; temporary,
escalating throttling; generic errors that do not reveal whether an ID exists;
permission-based authorisation on every server action; audit logging of security events.

Planned (Phase 10): nonce-based Content-Security-Policy and further hardening.

## Engineering decisions

| Decision                                             | Reason                                                                                                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom typed dictionaries instead of an i18n library | Two languages and server-rendered pages; compile-time key parity with no client runtime. Can move to `next-intl` later if plural/ICU needs grow.                                          |
| Locale in the URL (`/en`, `/ar`)                     | Shareable, cacheable, static pages per language; correct `lang`/`dir` in the first HTML byte.                                                                                             |
| Tailwind CSS 4 with a closed palette                 | Zero runtime CSS, logical-property utilities for RTL, and a palette that cannot drift.                                                                                                    |
| Western digits in Arabic                             | Student IDs (`MGIBT-2025-001`), scores and amounts read identically for staff and families. Easy to switch per locale in `src/i18n/config.ts` if preferred.                               |
| No component library                                 | Small, purpose-built primitives keep bundles small for low-end phones on mobile networks.                                                                                                 |
| npm, Node 22                                         | Matches Vercel defaults; Vitest 5 requires Node ≥ 20.19 / 22.12 types.                                                                                                                    |
| node-postgres (`pg`) driver for Neon                 | Full interactive transactions (needed for promotion, payments, PIN changes) over Neon's pooled endpoint; the same driver runs migrations. Pool cached across warm serverless invocations. |
| Money as integer kobo (`bigint`)                     | Exact arithmetic with no floating point or decimal library; ₦ formatting happens at display time.                                                                                         |
| Rules in the database as well as in code             | Triggers and constraints keep history append-only and IDs unique even if application code has a bug or someone uses SQL directly.                                                         |
| Neon Auth via server-side Server Actions only        | Credentials never touch client-side code, no client auth SDK is shipped, and no public `/api/auth` proxy (with sign-up) is exposed on our domain.                                         |
| Our own student sessions (not Neon Auth)             | Families sign in with a Student ID and PIN, not email accounts; opaque database-backed tokens allow instant revocation and forced PIN migration.                                          |
| argon2id + pepper for PINs                           | Memory-hard hashing plus a server secret, because the 6-digit PIN space is small.                                                                                                         |
| PGlite for database tests                            | Real PostgreSQL semantics (triggers, constraints) in-process: no server, Docker or credentials needed to run `npm test`.                                                                  |

## Delivery phases

1. **Foundation**: Next.js, TypeScript, structure, fonts, bilingual architecture,
   design system, environment setup, repository cleanup.
2. **Database**: Neon + Drizzle schema, migrations, seeds, database utilities.
3. **Authentication and authorisation**: staff auth, roles and permissions, secure
   student sign-in.
4. **Admin operations core**: admin shell, dashboard, student directory, registration,
   profiles, lifecycle, guardians, sessions, terms and enrolments. See [`admin.md`](admin.md).
5. **Admin experience**: admin shell, dashboard, registration and student management
   (the core of this was delivered in phase 4).
6. **Results**: score entry, validation, grading, ranking, publication.
7. **Student portal**: overview, results, fees, history, profile.
8. **Finance**: fees, payment ledger, receipts and statements.
9. **Promotion**: individual and bulk promotion, graduation.
10. **Operations**: audit log, settings, reports, security hardening, migration tooling.
11. **Polish**: responsive, RTL and accessibility QA, performance, production deployment.
