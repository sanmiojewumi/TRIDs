# Invoice Desk

A local-first invoice generator for a contractor who bills several companies, each with its own invoice style.
There is no server, no account and no internet dependency: clients, templates and saved invoices live in the
browser storage of whichever device you use. It runs on a PC and on a phone, and works offline once opened.

## What it does

- **Clients**: save each company once (billing address, template, reference prefix, payment terms, VAT, CIS rate).
- **Templates**: one invoice style per company ("Company A uses Invoice A"). Three layouts (classic, banded,
  minimal), accent colour, title, columns, payment note and footer are all editable. A "Trade Help" style is the default.
- **New invoice**: pick the client, enter site address/postcode, work date(s) and the amount. Preview, then
  *Save & download PDF*. Or type a prompt and let the form fill itself:
  `Company A, work done on the 18th, SW1A 1AA, 12 High Street Leeds, £450`
- **Automatic reference numbers**: per client, `CA-0001`, `CA-0002`, ... Numbers are never reused, even after a delete.
- **Automatic copy**: every issued invoice is stored as a full snapshot (so later edits to a client or template never change
  an old invoice). Re-download, duplicate, search, mark paid/unpaid from the Invoices tab.
- **UK contractor maths**: optional VAT, and CIS deduction applied to labour only (materials lines are excluded).
- **Share** button on phones that support sharing files (WhatsApp, email, Files).

The prompt box is a rule-based parser that runs on the device; it understands client names, dates (`18th`, `3rd to 5th`,
`yesterday`, `last Friday`, `18/10`, `18 October`), UK postcodes, `£` amounts and street addresses. It is not an AI model and sends nothing anywhere.

## Run it

```bash
npm install
npm run dev            # development, hot reload
npm test               # unit tests (parser, money, refs, layout)
npm run serve          # build + serve on your network at http://<pc-ip>:4173
npm run build:single   # one self-contained file: dist-single/index.html
```

### Using it on a phone without anything public

1. **Same Wi-Fi (simplest)**: run `npm run serve` on the PC, open `http://<pc-ip>:4173` on the phone, then
   *Add to Home Screen*. Browser storage is tied to that address, so keep the PC's IP fixed (router DHCP reservation)
   or use Export/Import backup to move data.
2. **Single file**: `npm run build:single`, copy `dist-single/index.html` to the phone and open it in Chrome (Android).
   Works fully offline.
3. **Move data between devices** at any time: Settings > Export backup, then Import backup on the other device.

If you later want it available away from your Wi-Fi, host the `dist/` folder privately (for example behind Tailscale or
Cloudflare Access). The app itself never uploads data, so this is optional.

## Data and privacy

Everything is in `localStorage` under `invoice-desk.v1` plus an unsent in-progress draft. Export a backup regularly: clearing
browser data or losing the phone erases invoices, and invoices should be kept for HMRC record-keeping.

## Layout of the code

| Path | Purpose |
| --- | --- |
| `src/layout.ts` | Turns an invoice into drawing ops (text, lines, rects, images) in mm on A4, with pagination |
| `src/render.ts` | Draws those ops as a vector PDF (jsPDF) and as SVG for the preview, so both are identical |
| `src/prompt.ts` | Offline prompt parser |
| `src/store.ts` | localStorage state, reference numbering, backup import/export |
| `src/ui/*` | Preact screens (New, Invoices, Clients, Templates, Settings) |
| `public/sw.js` | Offline cache for the installed app |
