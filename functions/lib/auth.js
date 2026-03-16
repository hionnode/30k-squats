const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = '';
  for (const b of bytes) code += CHARSET[b % CHARSET.length];
  return code;
}

export function generateUserId() {
  return crypto.randomUUID();
}
