import { createHmac } from 'crypto';

function base64url(input: string | Buffer) {
  const b = typeof input === 'string' ? Buffer.from(input) : input;
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function encode(obj: any) {
  return base64url(Buffer.from(JSON.stringify(obj)));
}

export function signJwt(payload: Record<string, any>, secret: string, expiresInSeconds = 60 * 60 * 24 * 7) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSeconds;
  const body = { ...payload, iat, exp };
  const toSign = `${encode(header)}.${encode(body)}`;
  const sig = createHmac('sha256', secret).update(toSign).digest();
  return `${toSign}.${base64url(sig)}`;
}

export function verifyJwt(token: string, secret: string) {
  if (!token) throw new Error('No token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [h, p, s] = parts;
  const toSign = `${h}.${p}`;
  const expected = base64url(createHmac('sha256', secret).update(toSign).digest());
  if (expected !== s) throw new Error('Invalid signature');
  const payload = JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');
  return payload as Record<string, any>;
}
