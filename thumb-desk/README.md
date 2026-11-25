# Thumb Desk

Place several thumbprints on a photo or a PDF, then save the stamped file into a folder you choose on the phone.

## On the phone

1. Install `releases/Thumb-Desk.apk` (version 1.0). It is a new app, package `com.trids.thumbdesk`.
2. Add a thumbprint for each person. Take a photo of the inked print, or pick one from your photos. "Lift the print off white paper" keeps the ink and drops a white background.
3. Open a document or image. Tap the page to place the selected print. Tap again to place another, including a different person's print.
4. Drag a print to move it. Size and Turn change the selected print. Remove this print takes it off the page.
5. Save. The first time, Android asks you to allow access to manage all files. Turn that on, come back, and tap Save again.
6. The file is written to **Internal storage/TRIDS APPS/Thumb Desk**. Change folder picks a different folder and remembers it.

A photo is saved as a JPEG. A PDF is saved as a PDF, one picture of each stamped page (up to 20 pages). The name ends in `-stamped`.

## On a computer

`npm test` checks placement, the white-paper removal, and the PDF wrapper. `npm run dev` opens the same screens in a browser. In the browser, Save downloads the file. Change folder is available in Chrome. On the phone, Save writes into the folder chosen in the app.

```bash
npm install
npm test
npm run dev
```

The Android package is built with:

```bash
npm run android:sync
cd android && ./gradlew assembleRelease
```
