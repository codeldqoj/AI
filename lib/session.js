import { assigned } from './education-access.js';
import { ObjectId } from 'mongodb';
import { getDb } from './db.js';
import crypto from 'node:crypto';

const COOKIE_NAME = 'vmo_session';
const MAX_AGE_SECONDS = 60 * 60 * 8;
const FALLBACK_SECRET = 'vmo-local-dev-session-secret-2026-2027';

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function secret() {
  const configured = process.env.JWT_SECRET && process.env.JWT_SECRET.trim();
  if (configured && configured.length >= 32) return configured;
  console.warn('[Auth] JWT_SECRET missing or too short; using built-in development fallback. Configure a strong JWT_SECRET in production.');
  return FALLBACK_SECRET;
}

export function signSession(user) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: String(user._id || user.username), username: user.username,
    fullName: user.fullName || user.username, role: user.role || 'student',
    educationLevels: assigned(user),
    iat: now, exp: now + MAX_AGE_SECONDS
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifySession(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', secret()).update(unsigned).digest('base64url');
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
}

export async function getSession(req) {
  const token = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  try {
    const session = verifySession(token);
    if (!session) return null;
    const users = (await getDb()).collection('users');
    const user = await users.findOne(ObjectId.isValid(session.sub)
      ? { _id: new ObjectId(session.sub), username: session.username }
      : { username: session.username }, { projection: { role: 1, educationLevels: 1 } });
    if (!user || (user.role || 'student') !== session.role) return null;
    if (session.educationLevels && JSON.stringify(session.educationLevels) !== JSON.stringify(assigned(user))) return null;
    return { ...session, educationLevels: assigned(user) };
  } catch { return null; }
}

function isSecureCookie(req = null) {
  if (req && typeof req === 'object') {
    const forwarded = req.headers && (req.headers['x-forwarded-proto'] || req.headers['X-Forwarded-Proto']);
    const proto = Array.isArray(forwarded) ? forwarded[0] : (forwarded || '');
    if (proto.split(',')[0].trim().toLowerCase() === 'https') return true;
    if (req.secure) return true;
  }
  return process.env.NODE_ENV === 'production';
}

export function setSessionCookie(res, token, req = null) {
  const secureAttrs = isSecureCookie(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secureAttrs}`);
}
export function clearSessionCookie(res, req = null) {
  const secureAttrs = isSecureCookie(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttrs}`);
}
