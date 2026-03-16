import { signJWT } from '../lib/jwt.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitKey = `link:${ip}`;
  const now = Date.now();
  const windowMs = 60_000;

  // Rate limit: 5 attempts per IP per 60s
  const rl = await env.DB.prepare(
    'SELECT count, window_start FROM rate_limits WHERE key = ?'
  ).bind(rateLimitKey).first();

  if (rl && (now - rl.window_start) < windowMs) {
    if (rl.count >= 5) {
      return Response.json({ error: 'too many attempts, try again later' }, { status: 429 });
    }
    await env.DB.prepare(
      'UPDATE rate_limits SET count = count + 1 WHERE key = ?'
    ).bind(rateLimitKey).run();
  } else {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)'
    ).bind(rateLimitKey, now).run();
  }

  const body = await request.json();
  const secret = (body.secret || '').toUpperCase().trim();
  if (!secret) {
    return Response.json({ error: 'missing code' }, { status: 400 });
  }

  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE secret = ?'
  ).bind(secret).first();

  if (!user) {
    return Response.json({ error: 'invalid code' }, { status: 404 });
  }

  const token = await signJWT(
    { sub: user.id, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 365 * 24 * 3600 },
    env.JWT_SECRET
  );

  return Response.json({ token });
}
