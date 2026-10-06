@AGENTS.md

# Markaz il Ginna V2

- Read `docs/architecture.md` before changing structure, i18n or the design system.
- All user-facing text goes in `src/i18n/dictionaries/` (en defines the shape, ar must match).
- Use logical layout utilities (`ms-`, `pe-`, `start-`, `text-start`) so RTL works.
- Only the palette in `src/app/globals.css` exists; do not add arbitrary colours.
- Run `npm run check && npm run build` before merging.
