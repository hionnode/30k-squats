import { generateSecret, generateUserId } from '../lib/auth.js';
import { signJWT } from '../lib/jwt.js';

export async function onRequestPost(context) {
  const { env } = context;
  const userId = generateUserId();
  const secret = generateSecret();
  const now = Date.now();

  await env.DB.prepare(
    'INSERT INTO users (id, secret, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).bind(userId, secret, now, now).run();

  const token = await signJWT(
    { sub: userId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 365 * 24 * 3600 },
    env.JWT_SECRET
  );

  return Response.json({ secret, token });
}
