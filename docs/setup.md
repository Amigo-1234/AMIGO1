# Setup

## Requirements

- Node.js 22.12+ (`.nvmrc` pins 22) and npm
- From Phase 2: a Neon PostgreSQL project
- From Phase 3: Neon Auth enabled on that project

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The root redirects to `/en` or `/ar` (see
[Architecture → Internationalisation](architecture.md#internationalisation)).

Fonts are downloaded from Google Fonts **at build time** by `next/font` and served
from the app itself, so builds need network access to `fonts.googleapis.com` /
`fonts.gstatic.com`. Visitors never contact Google.

## Environment variables

`.env.example` lists every variable by name. Copy it to `.env.local` (Git-ignored) and
fill in values. Never commit real values.

| Variable                 | Needed from | Purpose                                                  |
| ------------------------ | ----------- | -------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`    | optional    | Public base URL for absolute links in printed documents  |
| `DATABASE_URL`           | Phase 2     | Neon pooled connection string (application runtime)      |
| `DATABASE_URL_UNPOOLED`  | Phase 2     | Neon direct connection string (Drizzle migrations)       |
| `STUDENT_SESSION_SECRET` | Phase 3     | ≥32-character secret for signing student/parent sessions |
| Neon Auth variables      | Phase 3     | Names confirmed when Neon Auth is provisioned            |

Server code reads configuration through `src/lib/env.ts`, which validates values and
reports exactly which variable is missing when a feature needs it.

On Vercel, the Neon integration can inject `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
automatically; other values are set under Project → Settings → Environment Variables.

## Quality checks

```bash
npm run check   # lint, typecheck, tests, format check
npm run build   # production build
```

## Deployment (Vercel)

The repository is linked to the Vercel project `markazilginna`. That project was created
for the V1 static site. Before V2 goes to production, confirm in Vercel that:

1. **Framework Preset** is _Next.js_ (V1 was plain static files), with the default build
   and output settings.
2. **Node.js version** is 22.x or newer.
3. The production branch is `main`, and environment variables for Production and
   Preview are set (from Phase 2).

Pushes to other branches produce preview deployments only.
