<!-- # EMB Trip Ticket Kiosk

Clean-stack migration of the EMB Trip Ticket System. The application keeps the Trip Ticket domain, workflows, visual identity, route behavior, and compatible data identifiers while using the SERVIAMUS-style TypeScript architecture.

## Stack

- Backend: TypeScript, Express, Prisma, MySQL, Socket.IO, Zod
- Frontend: Next.js App Router, React, TypeScript
- RFID: ESP32 push receiver at `POST /api/rfid/read`; firmware posts scanned UIDs to the backend host (for this kiosk, `http://192.168.1.123:5001/api/rfid/read`).

## Setup

1. Copy `backend/.env.example` to `backend/.env` and configure MySQL and authentication. Keep `PORT=5001` while the ESP32 firmware targets port 5001.
2. Copy `frontend/.env.example` to `frontend/.env.local`.
3. Run `npm install` in both `backend` and `frontend`.
4. From `backend`, run `npx prisma generate`, then use `npx prisma db push` only against a new empty migration database. No command in this project alters the legacy database.
5. Optionally run `npm run seed` to import the local git-ignored compatibility seed.
6. Start both applications with `npm run dev`.

The legacy project, SERVIAMUS, and supermarket scanner references are read-only and are not runtime dependencies.

## Live GPS company locations

Edit `frontend/config/company-locations.ts` to define the fixed markers for company branches and sister companies. The initial entries are **examples only**: their names, logos, and coordinates do not represent actual company sites.

For each location, set:

- `id`: a unique, stable identifier, such as `branch-main`.
- `kind`: `branch` or `sister-company`, which determines its sidebar category. `main` is also supported for a main office and is grouped under Branches.
- `name`: the branch or company name to display.
- `latitude` and `longitude`: decimal coordinates for that site.
- `logoUrl`: a logo path, for example `/assets/company-locations/main-branch.png`. Put the image in `frontend/public/assets/company-locations/` (omit `/public` in the URL).
- `isPlaceholder`: change to `false` after replacing the sample details.

Duplicate an entry to add another marker, or remove an entry to remove it. Keep IDs unique. Save the file; the development server refreshes automatically. Rebuild and restart the frontend when using a production build. Invalid coordinates are not plotted. A missing logo uses a fallback symbol.

The sidebar groups Branches and Sister companies separately, with a count for each. Set `kind: "main"` on your main branch (currently EMB MAIN); the map always opens centered on that site's coordinates at zoom level 17. Selecting a company location in the sidebar or on the map centers it at the maximum zoom level (19). Drag to pan, use the mouse wheel or pinch to zoom, and use the larger +/− controls for stepwise zoom. **Main branch** restores the starting view, **Center selected** returns to the selected marker at your current zoom, and **Show all locations** fits every marker. Popups stay above the centered marker and scroll on smaller screens.

The GPS workspace fills the available page height. Use the **Locations** control to hide or show the directory, search for a company name, or switch to **Fleet** for vehicle details. The directory scrolls independently of the map. **Expand** opens a larger workspace; use **Exit** or press **Escape** to return. On smaller screens, the directory starts hidden and closes after selecting a location or vehicle to leave more room for the map.

Locations stay fixed and can be viewed even when there are no active trips or the GPS feed is unavailable. Select a marker or a location in the list to see its details. The map uses Leaflet with OpenStreetMap tiles; street-map tiles need an internet connection. See the [Leaflet guide](https://leafletjs.com/examples/quick-start/) and [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/) when configuring hosting.

### Connecting a vehicle GPS module later

The existing backend accepts `POST /api/gps/position`. Send `plate` for an ongoing trip (or `ticketNo`), `latitude`, `longitude`, and optionally `deviceId`, `speedKph`, `heading`, `accuracyMeters`, and `recordedAt`. Configure `EMB_GPS_DEVICE_KEY` in the backend environment and send its value in the `x-emb-gps-key` header. Vehicle positions arrive through the existing live connection and appear separately from the fixed company markers. No hardware connection is needed to use the company locations.

## Naming convention

Use descriptive `camelCase` names for variables, functions, parameters, and object instances. Names should communicate the value's role, not just its type: use `tripRequest`, `databaseTransaction`, and `reportResponse` rather than `request`, `tx`, and `r`.

Keep short names only for universally understood values in small scopes, such as a React event handler's `event`. Use `PascalCase` for types, interfaces, classes, and React components. Preserve database field names and API request/response keys when they form part of the existing contract; improve the local variable that represents them instead. -->
