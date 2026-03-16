const KNOWN_EXERCISES = ['squats', 'pushups', 'pullups', 'burpees'];
const MAX_PAYLOAD_BYTES = 512_000;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function validateSyncData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'data must be an object' };
  }

  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const clean = {};

  for (const key of Object.keys(data)) {
    if (dangerous.includes(key)) continue;

    if (key === '_goals') {
      if (typeof data._goals !== 'object' || Array.isArray(data._goals)) {
        return { valid: false, error: '_goals must be an object' };
      }
      clean._goals = {};
      for (const [gk, gv] of Object.entries(data._goals)) {
        if (KNOWN_EXERCISES.includes(gk) && typeof gv === 'number' && isFinite(gv)) {
          clean._goals[gk] = gv;
        }
      }
      continue;
    }

    if (!KNOWN_EXERCISES.includes(key)) continue;

    const ex = data[key];
    if (!ex || typeof ex !== 'object' || Array.isArray(ex)) {
      return { valid: false, error: `${key} must be an object` };
    }

    if (!Array.isArray(ex.sessions)) {
      return { valid: false, error: `${key}.sessions must be an array` };
    }

    if (typeof ex.year !== 'number') {
      return { valid: false, error: `${key}.year must be a number` };
    }

    const cleanEx = {
      sessions: [],
      year: ex.year,
      currentStreak: typeof ex.currentStreak === 'number' ? ex.currentStreak : 0,
      bestStreak: typeof ex.bestStreak === 'number' ? ex.bestStreak : 0,
      lastActiveDate: typeof ex.lastActiveDate === 'string' ? ex.lastActiveDate : null,
      unlockedMilestones: Array.isArray(ex.unlockedMilestones) ? ex.unlockedMilestones.filter(m => typeof m === 'number') : [],
      bestSession: typeof ex.bestSession === 'number' ? ex.bestSession : 0,
      bestDay: typeof ex.bestDay === 'number' ? ex.bestDay : 0,
      bestWeek: typeof ex.bestWeek === 'number' ? ex.bestWeek : 0,
    };

    for (const session of ex.sessions) {
      if (!session || typeof session !== 'object') continue;
      if (typeof session.date !== 'string') continue;
      if (!Array.isArray(session.entries)) continue;

      const cleanEntries = [];
      for (const entry of session.entries) {
        if (!entry || typeof entry !== 'object') continue;
        if (typeof entry.count !== 'number') continue;
        if (typeof entry.startTime !== 'string') continue;
        if (typeof entry.endTime !== 'string') continue;
        cleanEntries.push({ count: entry.count, startTime: entry.startTime, endTime: entry.endTime });
      }
      cleanEx.sessions.push({ date: session.date, entries: cleanEntries });
    }

    clean[key] = cleanEx;
  }

  return { valid: true, data: clean };
}

async function checkSyncRateLimit(env, userId) {
  const key = `sync:${userId}`;
  const now = Date.now();

  const rl = await env.DB.prepare(
    'SELECT count, window_start FROM rate_limits WHERE key = ?'
  ).bind(key).first();

  if (rl && (now - rl.window_start) < RATE_WINDOW_MS) {
    if (rl.count >= RATE_LIMIT) return false;
    await env.DB.prepare(
      'UPDATE rate_limits SET count = count + 1 WHERE key = ?'
    ).bind(key).run();
  } else {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)'
    ).bind(key, now).run();
  }
  return true;
}

export async function onRequestGet(context) {
  const { env, data } = context;
  const userId = data.userId;

  if (!(await checkSyncRateLimit(env, userId))) {
    return Response.json({ error: 'rate limit exceeded' }, { status: 429 });
  }

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

  // Payload size limit (header check)
  const contentLength = parseInt(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: 'payload too large' }, { status: 413 });
  }

  // Rate limit
  if (!(await checkSyncRateLimit(env, userId))) {
    return Response.json({ error: 'rate limit exceeded' }, { status: 429 });
  }

  const body = await request.json();
  const { data: syncData, baseVersion } = body;
  const now = Date.now();

  if (!syncData) {
    return Response.json({ error: 'missing data' }, { status: 400 });
  }

  // Validate and sanitize
  const validation = validateSyncData(syncData);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const cleanData = validation.data;

  // Post-parse size check
  const jsonStr = JSON.stringify(cleanData);
  if (jsonStr.length > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: 'payload too large' }, { status: 413 });
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
