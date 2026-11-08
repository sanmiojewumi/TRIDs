# Invoice Desk

A local-first invoice generator for a contractor who bills several companies, each with its own invoice style.
There is no server, no account and no internet dependency: clients, templates and saved invoices live in the
browser storage of whichever device you use. It runs on a PC and on a phone, and works offline once opened.

## What it does

- **Clients**: save each company once (billing address, template, payment terms). First run includes your
  business details, logo, bank details and Preferred Management Solution Ltd as a starter client.
- **Templates**: one invoice style per company ("Company A uses Invoice A"). The default "Trade Help" template reproduces
  your current Trade Help PDF (title and intro, logo top right, gradient rules, Description / Quantity / Unit Price / Cost,
  Total Price / Paid / Balance, due date and bank details bottom right). Classic, banded and minimal layouts are also
  available; accent colour, title, intro, columns, payment note and footer are all editable.
- **New invoice**: pick the client, enter site address/postcode, work date(s) and the amount. Preview, then
  *Save & download PDF*. Or type a prompt and let the form fill itself:
  `Preferred, work done on the 3rd, ST6 5EP, 471 High Street Stoke-on-Trent, £210`
- **One running invoice sequence** across all clients, starting at `00001` (zero-padded; padding and the next number are
  editable in Settings). In Settings choose the reference format: *Number only* (`00001`) or *Client postcode + number*
  (`NE312EX 00001`, as on Trade Help). Numbers are never reused, even after a delete.
- **Business address and details** are kept and editable in Settings at any time.
- **Not VAT registered**: VAT is off and hidden everywhere until you tick "VAT registered" in Settings.
- **Automatic copy**: every issued invoice is stored as a full snapshot (so later edits to a client or template never change
  an old invoice). Re-download, duplicate, search, mark paid/unpaid from the Invoices tab.
- **No deductions**: totals are simply the amount entered. VAT is available only if you register, and there is an optional "already paid" amount.
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
