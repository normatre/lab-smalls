# Future API Contracts

The GitHub Pages build is a static web app, so these endpoints are not active in the static export.
Use this contract when a server, serverless functions, or a database-backed deployment is added.

## Drums

- `POST /api/drums` - create drum
- `PATCH /api/drums` - update drum
- `POST /api/drums/finalise` - finalise drum after operator confirmation

## Scans

- `POST /api/scans/process` - upload image and run `chemicalVisionService.analyzeChemicalImage`

## Items

- `POST /api/items` - add manual item
- `PATCH /api/items` - edit or confirm item
- `DELETE /api/items` - delete item

## Search

- `GET /api/history?q=acetone` - search drum history
- `GET /api/products?q=acetone` - search product database

## Products

- `POST /api/products` - save confirmed product to reusable database

## Exports

- `POST /api/exports` - server-side export when a backend exists

The static app already provides client-side PDF, CSV, XLSX, and print exports.
