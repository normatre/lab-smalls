# Lab Smalls Scanner
## A faster, reviewable way to inventory laboratory smalls

**Lab Smalls Scanner is a mobile-first prototype for capturing laboratory chemical containers and preparing a structured inventory for operator review.** A chemist can photograph or upload a label, review the extracted fields, correct uncertain values, and export a drum inventory.

### The workflow

1. Create a drum record and identify the operator.
2. Capture a label photo or upload an existing image.
3. Read the proposed chemical identity and label details, including quantity, container size, concentration, and physical state.
4. Review the OCR text and confidence, correct fields, remove unwanted items, and resolve duplicate suggestions.
5. Confirm the inventory and download a PDF, CSV, or XLSX record.

### What a buyer can see in the demo

- A mobile-friendly scanning and review flow.
- Chemical name suggestions grounded in label OCR output.
- Editable fields with source and confidence indicators.
- Concentration text such as “4% in methanol” alongside quantity, size, and physical state.
- Review and confirmation steps before a record is finalised.
- Drum summary and PDF, CSV, and XLSX exports.

### Pilot discussion

The public demo is a prototype, not a certified waste-management or compliance system. Before a company pilot, agree the operating workflow and acceptance criteria, then scope the required identity provider, shared data store, audit trail, image-retention rules, hosting, integrations, and validation process with the customer.

**Live demo:** https://normatre.github.io/lab-smalls/?demo=1

**Current deployment note:** The public demo keeps records in the visitor's browser. The visible role selector is for demonstration only and does not secure records. Use synthetic information in this public demo.
