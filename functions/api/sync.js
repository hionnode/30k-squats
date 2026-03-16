export async function onRequestGet(context) {
  const { env, data } = context;
  const userId = data.userId;

  const row = await env.DB.prepare(
    'SELECT data, version FROM sync_data WHERE user_id = ?'
  ).bind(userId).first();

  if (!row) {
    return Response.json({ data: null, version: 0 });
  }
  return Response.json({ data: JSON.parse(row.data), version: row.version });
}

export async function onRequestPut(context) {
  const { env, data, request } = context;
  const userId = data.userId;
  const body = await request.json();
  const { data: syncData, baseVersion } = body;
  const now = Date.now();

  if (!syncData) {
    return Response.json({ error: 'missing data' }, { status: 400 });
  }

  const row = await env.DB.prepare(
    'SELECT data, version FROM sync_data WHERE user_id = ?'
  ).bind(userId).first();

  const serverVersion = row ? row.version : 0;

  if (baseVersion !== serverVersion) {
    return Response.json({
      ok: false,
      conflict: true,
      serverData: row ? JSON.parse(row.data) : null,
      serverVersion,
    });
  }

  const newVersion = serverVersion + 1;
  const jsonStr = JSON.stringify(syncData);

  if (row) {
    await env.DB.prepare(
      'UPDATE sync_data SET data = ?, version = ?, updated_at = ? WHERE user_id = ?'
    ).bind(jsonStr, newVersion, now, userId).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO sync_data (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)'
    ).bind(userId, jsonStr, newVersion, now).run();
  }

  await env.DB.prepare(
    'UPDATE users SET updated_at = ? WHERE id = ?'
  ).bind(now, userId).run();

  return Response.json({ ok: true, version: newVersion });
}
