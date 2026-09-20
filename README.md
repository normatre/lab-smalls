# Lab Smalls Scanner

Mobile-first hazardous-waste lab smalls inventory app for site chemists. The MVP enforces:

AI extraction -> human review -> confirmation -> final record

AI-detected data is never treated as verified until an operator confirms it.

## Stack

- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- PostgreSQL-ready Prisma schema
- PWA manifest
- Mock AI image extraction service

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

This workspace was bootstrapped with pnpm because npm/npx was not available in the local Codex runtime, but the project scripts are standard npm scripts.

## Static HTML / GitHub Pages

This project is configured for static export. Build the HTML/CSS/JS files with:

```bash
npm run export
```

The generated static site is written to:

```text
out/
```

You can publish `out/` to any static host, including GitHub Pages. A GitHub Actions workflow is included at:

```text
.github/workflows/deploy-pages.yml
```

To use it:

1. Push this project to a GitHub repository.
2. In GitHub, open Settings -> Pages.
3. Set Source to GitHub Actions.
4. Push to the `main` branch.

The app runs as a browser-only static web app in this mode. Demo data, mock AI extraction, exports, and review flows work without a backend.

## Environment

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Required for real database work:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lab_smalls_scanner?schema=public"
AI_PROVIDER="mock"
OPENAI_API_KEY=""
IMAGE_RETENTION_POLICY="until_completion"
```

## Database

The Prisma schema lives in `prisma/schema.prisma` and models:

- User
- Drum
- InventoryItem
- Product
- Scan
- Image
- AuditLog

After configuring PostgreSQL:

```bash
npx prisma migrate dev
npx prisma generate
```

The current UI uses typed demo data from `src/lib/demo-data.ts` so it runs immediately without a database.

## Demo Flow

1. Open the dashboard.
2. Use New Drum to create a drum like `LS-2026-003`.
3. Use Active Drums to upload or capture an image.
4. Mock AI extraction creates editable review cards.
5. Confirm every item or add missing manual data.
6. Unknown products, unknown physical state, missing fields, or review status block finalisation.
7. Export PDF, CSV, XLSX, or print view from the drum summary.

## AI Provider Boundary

Image recognition is isolated in:

```text
src/services/chemicalVision.ts
```

The app depends on this interface:

```ts
analyzeChemicalImage(image): Promise<{ items: DetectedChemical[]; warnings: string[] }>
```

Replace `MockChemicalVisionService` with a real provider implementation when API credentials are available. Keep server-side validation before saving any detected item.

## Barcode-Ready Boundary

Future barcode resolution is prepared in:

```text
src/services/barcode.ts
```

The resolver maps:

```text
barcode -> product database -> chemical name, container size, state, CAS, UN number
```

Barcode scanning is intentionally not required for the MVP.

## Future API Routes

Static GitHub Pages cannot run Next.js API routes. The backend contract is documented in:

```text
docs/api-contracts.md
```

Future server endpoints should cover:

- `POST /api/drums`
- `PATCH /api/drums`
- `POST /api/scans/process`
- `POST /api/items`
- `PATCH /api/items`
- `DELETE /api/items`
- `POST /api/drums/finalise`
- `GET /api/history?q=acetone`
- `GET /api/products?q=acetone`
- `POST /api/products`
- `POST /api/exports`

For now, the app is intentionally client-side and static-exportable.

## Verification

Run:

```bash
npm run lint
npm run build
```

Both passed in this workspace using the bundled pnpm runtime.

## Notes

- Units are not converted automatically.
- Confidence below 85% is marked with text and icon cues, not colour alone.
- Physical state must be label-backed, database-backed, or manually confirmed.
- Completion requires the final operator checkbox.
- Image retention is visible under Settings and defaults to "Keep until drum completion".
