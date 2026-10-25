import { isAuthorized, json } from './_lib.js';

// Verifies the master password sent in the x-admin-password header.
export async function POST(request: Request) {
  if (!process.env.ADMIN_PASSWORD) {
    return json({ error: 'ADMIN_PASSWORD is not configured on the server' }, 500);
  }
  return isAuthorized(request) ? json({ ok: true }) : json({ error: 'Incorrect password' }, 401);
}
