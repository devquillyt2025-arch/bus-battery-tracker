import { ensureSchema, getSql, isAuthorized, json, parseRecordInput, serverError } from './_lib.js';

// GET    /api/records                         list all records (public)
// POST   /api/records                         create a record
// PATCH  /api/records?id=…                    update a record, snapshotting the old values into history
// DELETE /api/records?id=…                    delete a record
// DELETE /api/records?id=…&historyIndex=N     delete one history snapshot

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT
        id,
        bus_number      AS "busNumber",
        battery,
        battery1,
        battery1_date   AS "battery1Date",
        battery2,
        battery2_date   AS "battery2Date",
        starter,
        starter_date    AS "starterDate",
        alternator,
        alternator_date AS "alternatorDate",
        fan_belt        AS "fanBelt",
        fan_belt_date   AS "fanBeltDate",
        note,
        history,
        created_at::float8   AS "timestamp",
        last_updated::float8 AS "lastUpdated"
      FROM battery_records
      ORDER BY created_at DESC
    `;
    return json(rows);
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return json({ error: 'Unauthorized' }, 401);
  const input = parseRecordInput(await request.json().catch(() => null));
  if (!input) return json({ error: 'Invalid record' }, 400);

  try {
    await ensureSchema();
    const sql = getSql();
    const now = Date.now();
    const [row] = (await sql`
      INSERT INTO battery_records (
        bus_number, battery1, battery1_date, battery2, battery2_date,
        starter, starter_date, alternator, alternator_date,
        fan_belt, fan_belt_date, note, created_at, last_updated
      ) VALUES (
        ${input.busNumber}, ${input.battery1}, ${input.battery1Date}, ${input.battery2}, ${input.battery2Date},
        ${input.starter}, ${input.starterDate}, ${input.alternator}, ${input.alternatorDate},
        ${input.fanBelt}, ${input.fanBeltDate}, ${input.note}, ${now}, ${now}
      )
      RETURNING id
    `) as { id: string }[];
    return json(row, 201);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return json({ error: 'Unauthorized' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  const input = parseRecordInput(await request.json().catch(() => null));
  if (!id || !input) return json({ error: 'Invalid record' }, 400);

  try {
    await ensureSchema();
    const sql = getSql();
    const now = Date.now();
    // The right-hand side of SET sees the pre-update row, so the snapshot holds the old values.
    const rows = await sql`
      UPDATE battery_records SET
        history = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'battery1',       COALESCE(NULLIF(battery1, ''), battery),
          'battery1Date',   battery1_date,
          'battery2',       battery2,
          'battery2Date',   battery2_date,
          'starter',        starter,
          'starterDate',    starter_date,
          'alternator',     alternator,
          'alternatorDate', alternator_date,
          'fanBelt',        fan_belt,
          'fanBeltDate',    fan_belt_date,
          'note',           note,
          'snapshotTimestamp', ${now}::bigint
        ))) || history,
        bus_number      = ${input.busNumber},
        battery1        = ${input.battery1},
        battery1_date   = ${input.battery1Date},
        battery2        = ${input.battery2},
        battery2_date   = ${input.battery2Date},
        starter         = ${input.starter},
        starter_date    = ${input.starterDate},
        alternator      = ${input.alternator},
        alternator_date = ${input.alternatorDate},
        fan_belt        = ${input.fanBelt},
        fan_belt_date   = ${input.fanBeltDate},
        note            = ${input.note},
        last_updated    = ${now}
      WHERE id = ${id}
      RETURNING id
    `;
    return rows.length ? json({ ok: true }) : json({ error: 'Not found' }, 404);
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return json({ error: 'Unauthorized' }, 401);
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  if (!id) return json({ error: 'Missing id' }, 400);

  try {
    await ensureSchema();
    const sql = getSql();
    const historyIndexParam = params.get('historyIndex');
    let rows;
    if (historyIndexParam !== null) {
      const historyIndex = Number(historyIndexParam);
      if (!Number.isInteger(historyIndex) || historyIndex < 0) return json({ error: 'Invalid historyIndex' }, 400);
      rows = await sql`
        UPDATE battery_records
        SET history = history - ${historyIndex}::int, last_updated = ${Date.now()}
        WHERE id = ${id}
        RETURNING id
      `;
    } else {
      rows = await sql`DELETE FROM battery_records WHERE id = ${id} RETURNING id`;
    }
    return rows.length ? json({ ok: true }) : json({ error: 'Not found' }, 404);
  } catch (err) {
    return serverError(err);
  }
}
