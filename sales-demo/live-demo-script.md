# Five-minute live demo script

## Before the meeting

Open [the Sales Demo](https://normatre.github.io/lab-smalls/?demo=1), select **Reset demo**, and keep the browser at the dashboard. Use the fictional sample data. If showing live image OCR, set up the presenter's own API key in advance and test it with a non-sensitive label image.

## 0:00–0:45 — Frame the problem

“Lab Smalls Scanner is a mobile-first prototype for turning chemical-container labels into a reviewable drum inventory. The goal is to reduce repetitive transcription while keeping an operator in control of every proposed record.”

Ask: “How do your teams currently record small chemical containers, and where does the process slow down?”

## 0:45–1:30 — Show the dashboard and drum

Point out the active drum, review count, operator, and sample records. Open the active drum and explain that a drum is the working container record; the item list is the inventory built from individual label scans.

## 1:30–2:45 — Show the review step

Open a review item. Point to the OCR output, chemical name, concentration, container size, quantity, physical state, source, and confidence. Explain that extracted values remain editable and require operator confirmation. If demonstrating image intake, upload the prepared label and compare its OCR result with the visible label.

## 2:45–3:30 — Resolve a review item

Edit a field or accept a name suggestion. Show how a user can delete an unwanted item or combine duplicates. Explain that differing concentration values are kept separate in duplicate review.

## 3:30–4:15 — Show the completed record

Open Drum Summary. Show the line items and status, then open the PDF/CSV/XLSX export controls. Download the PDF to illustrate the hand-off record.

## 4:15–5:00 — Qualify a pilot

“This public build is a browser-local prototype. A company pilot would be scoped around your identity, shared storage, audit, retention, hosting, and approval requirements. Which of those would be essential for your first team?”

Use the [pilot-discovery checklist](pilot-discovery-checklist.md) to capture next steps. Do not describe the public demo as certified or production-ready.
