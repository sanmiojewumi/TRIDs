# TRIDs

Route planner for a day of client stops. Add addresses, phone numbers, and arrival windows in any order, then optimize the drive.

Road times come from the public OSRM server. Address search uses OpenStreetMap via Photon. Neither includes live traffic. Each stop can open in Google Maps for navigation.

```bash
npm install
npm test
npm run dev
```

Signed-in use stores every day in the app database, including days you mark saved. Without a sign-in, those records stay in the browser.

Navigate hands the next stop to Google Maps, Waze, or Apple Maps. Choose the satnav in the bar at the bottom of the route.

On a phone, open the published page and install it from the browser. Android can use Install app. iPhone uses Safari, Share, Add to Home Screen. Apple does not install an unsigned app file, so that home-screen icon is the iPhone app.
