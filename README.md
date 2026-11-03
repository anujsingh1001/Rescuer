# Animal Rescue Network

A full-stack animal rescue coordination MVP built with React, Vite, Node.js, Express, PostgreSQL, Socket.IO and JWT.

## Features
- Landing page starts with two clear paths: **Citizen** and **NGO**.
- Citizen registration/login and emergency reporting.
- NGO registration/login; NGO accounts remain pending until approved by an admin.
- Admin can approve NGOs.
- Nearby verified NGOs are notified in real time when a citizen submits a request.
- NGO dashboard to accept requests and update rescue status.
- Citizen dashboard to track submitted reports.
- REST API, PostgreSQL schema, Docker Compose and deployment configuration.

## Local setup

Requirements: Node.js 20+, npm, Docker Desktop.

1. Copy environment examples:
   - `cp server/.env.example server/.env`
   - `cp client/.env.example client/.env`
2. Start PostgreSQL:
   ```bash
   docker compose up -d
   ```
3. Install and start backend:
   ```bash
   cd server
   npm install
   npm run dev
   ```
4. In another terminal install and start frontend:
   ```bash
   cd client
   npm install
   npm run dev
   ```
5. Open http://localhost:5173

The database schema is initialized automatically on the first Docker database startup. If you change `database/init.sql` after the volume already exists, recreate the database with `docker compose down -v` followed by `docker compose up -d` (this deletes local database data).

## Create the first admin

Register a normal account, then use the one-time bootstrap endpoint while the database has no admin:
```bash
curl -X POST http://localhost:5000/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-secret: change-this-bootstrap-secret" \
  -d '{"email":"you@example.com"}'
```
Set `BOOTSTRAP_SECRET` in `server/.env` first. Remove/rotate it after creating the admin. This endpoint only works while no admin exists.

## Deploy

### Backend (Render)
- Create a PostgreSQL database (use PostGIS-enabled PostgreSQL if using nearby distance matching).
- Create a Render Web Service from the `server` directory.
- Build command: `npm install`
- Start command: `npm start`
- Set `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`, `BOOTSTRAP_SECRET`, `NODE_ENV=production`.
- For a managed Postgres provider without PostGIS, the app still works using city/state matching; nearby matching falls back to location labels.

### Frontend (Vercel)
- Import the repository into Vercel.
- Root directory: `client`
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` to `https://YOUR-BACKEND-DOMAIN/api`
- Set `VITE_SOCKET_URL` to `https://YOUR-BACKEND-DOMAIN`

### Important production checklist
- Use HTTPS and strong unique secrets.
- Configure a managed PostgreSQL database and backups.
- Configure an image storage provider before accepting public image uploads; this MVP stores an optional image URL, not uploaded binary files.
- Configure transactional email/SMS for reliable alerts. Socket.IO notifications are delivered to connected, online NGO users.
- Verify NGO documents and operational capacity manually.
- Add rate limiting, audit logging, privacy policy, terms, consent and data-retention rules before public launch.
- Never publish real emergency contact details without consent.
- The platform is a coordination tool, not a guaranteed emergency dispatch service.

## API summary
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/reports` (citizen)
- `GET /api/reports/mine` (citizen)
- `GET /api/ngo/reports` (approved NGO)
- `PATCH /api/ngo/reports/:id/status` (approved NGO)
- `GET /api/admin/ngos/pending` (admin)
- `PATCH /api/admin/ngos/:id/approve` (admin)
