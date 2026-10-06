# Markaz il Ginna · مركز الجنة

School management and student-results platform for Markaz il Ginna, an Islamic school.
It serves students and parents (results, fees, academic history) and school staff
(registration, academics, results, finance, promotion), in English and Arabic.

This is **V2**, a ground-up rebuild. The original static Firebase app ("First Edition")
is preserved in Git history under the tag `v1-first-edition`; see
[`docs/legacy-v1.md`](docs/legacy-v1.md).

## Stack

- [Next.js 16](https://nextjs.org) (App Router) · React 19 · TypeScript (strict)
- Tailwind CSS 4 with a custom token set · Manrope + Noto Kufi Arabic via `next/font`
- Neon PostgreSQL + Drizzle ORM (Phase 2) · Neon Auth for staff (Phase 3)
- Vitest · ESLint · Prettier · deployed on Vercel

## Getting started

Requires Node.js 22.12 or newer.

```bash
npm install
cp .env.example .env.local   # values are optional until Phase 2
npm run dev                  # http://localhost:3000 → redirects to /en or /ar
```

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Development server                        |
| `npm run build`     | Production build                          |
| `npm run start`     | Serve the production build                |
| `npm run lint`      | ESLint                                    |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm run test`      | Unit tests (Vitest)                       |
| `npm run format`    | Format with Prettier                      |
| `npm run check`     | Lint + typecheck + tests + format check   |

Run `npm run check && npm run build` before merging any branch.

## Documentation

- [Setup](docs/setup.md): local development, environment variables, deployment
- [Architecture](docs/architecture.md): structure, i18n, design system, security, decisions
- [Database migration](docs/database-migration.md): moving V1 Firestore data into PostgreSQL
- [Legacy V1](docs/legacy-v1.md): business rules carried over from the First Edition

## Status

The rebuild proceeds in phases, each on its own branch and merged into `main` when lint,
typecheck, tests and the production build pass. See the phase list in
[`docs/architecture.md`](docs/architecture.md#delivery-phases).
