# KSRTC Arsikere Depot Battery Tracker

React + Vite frontend, Vercel serverless functions in `api/`, Neon Postgres for storage.

## Environment variables

| Name             | Description                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`   | Neon connection string (pooled)                                     |
| `ADMIN_PASSWORD` | Master password for add / edit / delete. Never sent to the browser. |

The `battery_records` table is created automatically on the first API request. The schema is also in [db/schema.sql](db/schema.sql) if you prefer to run it yourself in the Neon SQL editor.

## Run locally

```
npm install
cp .env.example .env    # then fill in the values
npm run dev             # http://localhost:3000 — serves the UI and /api together
```

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel (framework preset: Vite).
2. Add `DATABASE_URL` and `ADMIN_PASSWORD` under Project → Settings → Environment Variables
   (or use the Neon integration from the Vercel Marketplace, which sets `DATABASE_URL` for you).
3. Deploy.

## API

| Method | Path                                    | Auth | Purpose                                   |
| ------ | --------------------------------------- | ---- | ----------------------------------------- |
| GET    | `/api/records`                          | –    | List records, newest first                |
| POST   | `/api/records`                          | yes  | Create a record                           |
| PATCH  | `/api/records?id=…`                     | yes  | Update; previous values go into `history` |
| DELETE | `/api/records?id=…`                     | yes  | Delete a record                           |
| DELETE | `/api/records?id=…&historyIndex=N`      | yes  | Delete one history snapshot               |
| POST   | `/api/auth`                             | yes  | Check the password                        |

Auth = `x-admin-password` header matching `ADMIN_PASSWORD`.
