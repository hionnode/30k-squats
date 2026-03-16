import { verifyJWT } from '../lib/jwt.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://30k-squats.xyz',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(context.request.url);
  const path = url.pathname;

  // Public endpoints — no auth required
  if (path === '/api/register' || path === '/api/link') {
    const response = await context.next();
    return addCors(response);
  }

  // Auth required for everything else
  const auth = context.request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const payload = await verifyJWT(auth.slice(7), context.env.JWT_SECRET);
    const userId = payload.sub;

    // Verify user exists in DB
    const user = await context.env.DB.prepare(
      'SELECT id FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      return json({ error: 'unauthorized' }, 401);
    }

    context.data.userId = userId;
  } catch (e) {
    return json({ error: 'unauthorized' }, 401);
  }

  const response = await context.next();
  return addCors(response);
}

function addCors(response) {
  const newResponse = new Response(response.body, response);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    newResponse.headers.set(k, v);
  }
  return newResponse;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
