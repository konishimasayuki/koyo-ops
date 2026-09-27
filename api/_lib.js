import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';

const PREFIX = 'koyo';
const SESSION_DAYS = 14;
const COOKIE = 'koyo_session';

let client = globalThis.__koyoRedis || null;
export function redis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redisの環境変数が設定されていません');
  client = new Redis({ url, token });
  return client;
}

export const key = (...parts) => [PREFIX, ...parts].join(':');
export const newId = () => `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
export const now = () => new Date().toISOString();

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(String(password), salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt };
}

// 一覧はMGETでまとめて取得する
export async function getMany(ids, kind) {
  if (!ids || ids.length === 0) return [];
  const r = redis();
  const vals = await r.mget(...ids.map((id) => key(kind, id)));
  return vals.filter(Boolean);
}

export async function listUsers() {
  const ids = await redis().smembers(key('users'));
  const users = await getMany(ids, 'user');
  return users.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export async function saveUser(u) {
  const r = redis();
  await r.set(key('user', u.id), u);
  await r.set(key('username', u.username.toLowerCase()), u.id);
  await r.sadd(key('users'), u.id);
}

// 初回だけ管理者 z / z を自動作成する
export async function ensureSeed() {
  const r = redis();
  const count = await r.scard(key('users'));
  if (count > 0) return;
  await saveUser({ id: newId(), username: 'z', name: '管理者', role: 'admin', password: hashPassword('z'), createdAt: now() });
}

export function readCookie(req, name) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setSessionCookie(res, token, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'development' ? '' : ' Secure;';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAgeSec}`);
}

export async function createSession(res, userId) {
  const token = randomBytes(24).toString('hex');
  const ttl = SESSION_DAYS * 86400;
  await redis().set(key('session', token), userId, { ex: ttl });
  setSessionCookie(res, token, ttl);
}

export async function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await redis().del(key('session', token));
  setSessionCookie(res, '', 0);
}

export async function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const r = redis();
  const userId = await r.get(key('session', token));
  if (!userId) return null;
  return (await r.get(key('user', userId))) || null;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

// ログイン必須のAPIをまとめて守る
export function withAuth(handler, { admin = false } = {}) {
  return async (req, res) => {
    try {
      await ensureSeed();
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: 'ログインしてください' });
      if (admin && user.role !== 'admin') return send(res, 403, { error: '管理者のみ操作できます' });
      return await handler(req, res, user);
    } catch (e) {
      return send(res, 500, { error: e.message || 'サーバーエラー' });
    }
  };
}
