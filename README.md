# Lab Smalls Scanner

**Lab Chemicals Inventory Management** for recording laboratory smalls by drum. The app supports photo and voice intake, editable OCR results, human review, and inventory exports.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Inventory workflow

1. Create a drum and enter its operator, size and date.
2. Capture or upload a label photo, record speech, or enter an item manually.
3. Review the chemical name, quantity, package size, concentration and physical state against the label.
4. Correct uncertain fields and confirm the items.
5. Resolve any remaining review blockers, then finalise and export the inventory.

The app starts with an empty inventory. Drum data, settings and saved product details remain in the current browser and are not automatically shared across devices.

## Recognition and data

Image recognition uses OpenAI when an API key is entered in Settings. Tesseract OCR and chemical database lookups are used as supporting or fallback readers. Saved audio transcription also uses OpenAI; live browser speech recognition may work without an API key where supported. Recognition can be wrong, so verify each result against the container label and site procedure.

The OpenAI API key is stored in the current browser. When OpenAI recognition is used, the relevant image or audio is sent to OpenAI for processing. Do not submit information unless you are authorised to do so. See the in-app **Copyright & privacy** page for more information.

## Build and publish

```bash
pnpm build
```

The static export is written to `out/`. GitHub Pages deployment is configured in `.github/workflows/deploy-pages.yml`.

## Main technologies

- Next.js App Router, React, TypeScript and Tailwind CSS
- Tesseract.js OCR and PubChem lookup
- OpenAI image and audio processing when configured by the user
- Browser-local inventory storage and PDF, CSV, XLSX and print exports
