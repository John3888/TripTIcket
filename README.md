# EMB Trip Ticket Kiosk

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

## Naming convention

Use descriptive `camelCase` names for variables, functions, parameters, and object instances. Names should communicate the value's role, not just its type: use `tripRequest`, `databaseTransaction`, and `reportResponse` rather than `request`, `tx`, and `r`.

Keep short names only for universally understood values in small scopes, such as a React event handler's `event`. Use `PascalCase` for types, interfaces, classes, and React components. Preserve database field names and API request/response keys when they form part of the existing contract; improve the local variable that represents them instead.
