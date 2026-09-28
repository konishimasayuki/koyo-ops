import { body, getMany, key, loadTaskConfig, newId, now, redis, send, withAuth } from './_lib.js';

const STATUSES = ['未着手', '進行中', '完了'];
const PRIORITIES = ['高', '中', '低'];
const idsKey = key('tasks');

function clean(input, cfg, base = {}) {
  const t = { ...base };
  const names = cfg.categories.map((c) => c.name);
  if (input.title !== undefined) t.title = String(input.title).trim().slice(0, 120);
  if (input.detail !== undefined) t.detail = String(input.detail).slice(0, 2000);
  if (input.category !== undefined) t.category = names.includes(input.category) ? input.category : names[0];
  if (input.priority !== undefined) t.priority = PRIORITIES.includes(input.priority) ? input.priority : '中';
  if (input.status !== undefined) t.status = STATUSES.includes(input.status) ? input.status : '未着手';
  if (input.assigneeId !== undefined) t.assigneeId = cfg.assignees.some((a) => a.id === input.assigneeId) ? input.assigneeId : '';
  if (input.dueDate !== undefined) t.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || '') ? input.dueDate : '';
  t.company = cfg.categories.find((c) => c.name === t.category)?.company || '3社共同';
  return t;
}

export default withAuth(async (req, res, me) => {
  const r = redis();

  if (req.method === 'GET') {
    const ids = await r.smembers(idsKey);
    const tasks = await getMany(ids, 'task');
    return send(res, 200, { tasks });
  }

  if (req.method === 'POST') {
    const input = body(req);
    if (!String(input.title || '').trim()) return send(res, 400, { error: 'タスク名を入力してください' });
    const cfg = await loadTaskConfig();
    const t = clean({ category: cfg.categories[0]?.name, priority: '中', status: '未着手', assigneeId: '', dueDate: '', detail: '', ...input }, cfg);
    const stamp = now();
    Object.assign(t, { id: newId(), createdAt: stamp, updatedAt: stamp, createdBy: me.id, completedAt: '', completedBy: '' });
    if (t.status === '完了') Object.assign(t, { completedAt: stamp, completedBy: me.id });
    await r.set(key('task', t.id), t);
    await r.sadd(idsKey, t.id);
    return send(res, 201, { task: t });
  }

  if (req.method === 'PUT') {
    const input = body(req);
    const cur = input.id ? await r.get(key('task', input.id)) : null;
    if (!cur) return send(res, 404, { error: 'タスクが見つかりません' });
    const cfg = await loadTaskConfig();
    const t = clean(input, cfg, cur);
    if (!t.title) return send(res, 400, { error: 'タスク名を入力してください' });
    const stamp = now();
    if (cur.status !== '完了' && t.status === '完了') Object.assign(t, { completedAt: stamp, completedBy: me.id });
    if (cur.status === '完了' && t.status !== '完了') Object.assign(t, { completedAt: '', completedBy: '' });
    t.updatedAt = stamp;
    t.updatedBy = me.id;
    await r.set(key('task', t.id), t);
    return send(res, 200, { task: t });
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id || body(req).id;
    if (!id) return send(res, 400, { error: 'IDがありません' });
    await r.del(key('task', id));
    await r.srem(idsKey, id);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
