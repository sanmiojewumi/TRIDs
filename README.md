# TRIDs

Route planner for a day of client stops. Add addresses, phone numbers, and arrival windows in any order, then optimize the drive.

Road times come from the public OSRM server. Address search uses OpenStreetMap via Photon. Neither includes live traffic. Each stop can open in Google Maps for navigation.

```bash
npm install
npm test
npm run dev
```

Signed-in use stores routes in the app database. Without a sign-in, routes stay in the browser.
