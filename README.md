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

## Company sales demo

The public sales demo opens with fictional sample drums and review items:

```text
https://normatre.github.io/lab-smalls/?demo=1
```

The **Sales demo** button in the app opens the same isolated demo mode. The demo kit includes a buyer-facing overview, a five-minute walkthrough, and a pilot discovery checklist in [`sales-demo/`](sales-demo/README.md).

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
4. Or choose **Speak / Record** to dictate a chemical and its details, or **Upload Audio** to add a recording. Audio is transcribed and extracted into the same editable review cards as photo scans.
5. Mock AI extraction creates editable review cards for image scans when no OpenAI key is configured.
6. Confirm every item or add missing manual data.
7. Unknown products, unknown physical state, missing fields, or review status block finalisation.
8. Export PDF, CSV, XLSX, or print view from the drum summary.

Audio and OpenAI image recognition use the API key configured in **Settings** in the current browser. Recordings are sent to OpenAI for transcription and are not saved as drum attachments. Uploads must be no larger than 25 MB; supported formats include MP3, M4A, WAV, OGG and WebM. Every extracted value remains editable and requires operator review.

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

The same service also provides `analyzeChemicalAudio` and `analyzeChemicalTranscript` for the normal application flow. Audio uses OpenAI's `gpt-transcribe` transcription model and then extracts chemical name, container quantity, package size/unit and physical state. The original transcript appears in the review card's OCR output area.

## Chemical Database Lookup

Client-side OCR is supported with `tesseract.js`. When OCR text is available, the app first checks the local common-lab-chemical catalogue, then queries PubChem PUG-REST for broader compound coverage.

```text
src/services/pubChem.ts
```

PubChem improves name, synonym, CID, CAS, formula, and physical-state inference, but the operator must still review every field before finalisation.

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
