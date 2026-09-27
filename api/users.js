import { body, hashPassword, key, listUsers, newId, now, publicUser, redis, saveUser, send, withAuth } from './_lib.js';

// GET: 一覧（全員） / POST: 追加（管理者） / PUT: 名前・権限・パスワード変更 / DELETE: 削除（管理者）
export default withAuth(async (req, res, me) => {
  const r = redis();

  if (req.method === 'GET') {
    const users = await listUsers();
    return send(res, 200, { users: users.map(publicUser) });
  }

  if (req.method === 'POST') {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ追加できます' });
    const { username, name, password, role } = body(req);
    const uname = String(username || '').trim();
    if (!uname || !password) return send(res, 400, { error: 'ログインIDとパスワードは必須です' });
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(uname)) return send(res, 400, { error: 'ログインIDは半角英数字と . _ - で入力してください' });
    if (await r.get(key('username', uname.toLowerCase()))) return send(res, 409, { error: 'このログインIDは使われています' });
    const user = {
      id: newId(),
      username: uname,
      name: String(name || uname).trim(),
      role: role === 'admin' ? 'admin' : 'member',
      password: hashPassword(password),
      createdAt: now(),
    };
    await saveUser(user);
    return send(res, 201, { user: publicUser(user) });
  }

  if (req.method === 'PUT') {
    const { id, name, role, password } = body(req);
    const targetId = id || me.id;
    if (targetId !== me.id && me.role !== 'admin') return send(res, 403, { error: '自分以外のユーザーは変更できません' });
    const user = await r.get(key('user', targetId));
    if (!user) return send(res, 404, { error: 'ユーザーが見つかりません' });
    if (name !== undefined) user.name = String(name).trim() || user.name;
    if (role !== undefined && me.role === 'admin' && targetId !== me.id) user.role = role === 'admin' ? 'admin' : 'member';
    if (password) user.password = hashPassword(password);
    await r.set(key('user', user.id), user);
    return send(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'DELETE') {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ削除できます' });
    const id = req.query?.id || body(req).id;
    if (!id) return send(res, 400, { error: 'IDがありません' });
    if (id === me.id) return send(res, 400, { error: '自分自身は削除できません' });
    const user = await r.get(key('user', id));
    if (!user) return send(res, 404, { error: 'ユーザーが見つかりません' });
    await r.del(key('user', id));
    await r.del(key('username', user.username.toLowerCase()));
    await r.srem(key('users'), id);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
