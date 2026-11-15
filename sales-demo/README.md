# Lab Smalls Scanner — Sales Demo Kit

This folder contains a buyer-facing product overview, a short live-demo script, and a pilot-discovery checklist.

## Launch the live demo

Open the public demo in a desktop or mobile browser:

**https://normatre.github.io/lab-smalls/?demo=1**

The app opens with fictional sample drums and review items. The banner identifies Sales Demo mode and provides **Reset demo** and **Exit demo** controls. Demo records and OCR corrections are saved in a separate local browser store from the user's normal inventory. Reset returns the sample inventory to its starting state.

The app header also has a **Sales demo** button that opens this mode from the regular site.

## Suggested meeting setup

- Open the demo URL before the meeting and reset the sample data.
- Use a laptop for the walkthrough; the app is responsive on phones.
- Keep one clear chemical label photo ready if you plan to demonstrate image capture. Live AI OCR requires the presenter to configure their own OpenAI API key in Settings; do not enter a buyer's key.
- Use fictional records only. Do not upload a prospect's or customer's real inventory to this public prototype.
- Download an example PDF during the meeting if the buyer wants to see the output.

## What the current demo represents

The demo demonstrates a browser-based workflow prototype: drum setup, image intake, OCR-assisted extraction, human review, concentration and container fields, duplicate handling, and PDF/CSV/XLSX exports. It does not claim regulatory certification or hazardous-waste manifest approval.

This public GitHub Pages version stores its records and settings in the current browser. The role selector is a demonstration control, not authentication or access control. It has no shared company database, SSO, or centrally managed user accounts. Confirm the buyer's deployment, security, retention, and integration requirements before proposing a production pilot.
