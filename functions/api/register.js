import { generateSecret, generateUserId } from '../lib/auth.js';
import { signJWT } from '../lib/jwt.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();

  // Rate limit: 3 registrations per IP per 60s
  const rateLimitKey = `register:${ip}`;
  const windowMs = 60_000;

  const rl = await env.DB.prepare(
    'SELECT count, window_start FROM rate_limits WHERE key = ?'
  ).bind(rateLimitKey).first();

  if (rl && (now - rl.window_start) < windowMs) {
    if (rl.count >= 3) {
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

  const userId = generateUserId();
  const secret = generateSecret();

  await env.DB.prepare(
    'INSERT INTO users (id, secret, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).bind(userId, secret, now, now).run();

  const token = await signJWT(
    { sub: userId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 365 * 24 * 3600 },
    env.JWT_SECRET
  );

  return Response.json({ secret, token });
}
