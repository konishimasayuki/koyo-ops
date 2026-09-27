import { body, createSession, currentUser, destroySession, ensureSeed, key, publicUser, redis, send, verifyPassword } from './_lib.js';

// GET: ログイン中のユーザー / POST: ログイン / DELETE: ログアウト
export default async function handler(req, res) {
  try {
    await ensureSeed();
    if (req.method === 'GET') {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: 'ログインしてください' });
      return send(res, 200, { user: publicUser(user) });
    }
    if (req.method === 'POST') {
      const { username, password } = body(req);
      if (!username || !password) return send(res, 400, { error: 'IDとパスワードを入力してください' });
      const r = redis();
      const id = await r.get(key('username', String(username).trim().toLowerCase()));
      const user = id ? await r.get(key('user', id)) : null;
      if (!user || !verifyPassword(password, user.password)) {
        return send(res, 401, { error: 'IDまたはパスワードが違います' });
      }
      await createSession(res, user.id);
      return send(res, 200, { user: publicUser(user) });
    }
    if (req.method === 'DELETE') {
      await destroySession(req, res);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    return send(res, 500, { error: e.message || 'サーバーエラー' });
  }
}
