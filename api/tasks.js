import { body, configKey, getMany, key, loadTaskConfig, newId, now, redis, send, withAuth } from './_lib.js';
import { ALIASES, PDF_TASKS, TARGET_CATEGORIES, guessCategory } from './_seed.js';

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
  if (input.checklist !== undefined) {
    t.checklist = (Array.isArray(input.checklist) ? input.checklist : [])
      .slice(0, 60)
      .map((c) => ({
        id: c.id || newId(),
        text: String(c.text ?? '')
          .trim()
          .slice(0, 200),
        done: !!c.done,
      }))
      .filter((c) => c.text);
  }
  t.company = cfg.categories.find((c) => c.name === t.category)?.company || '3社共同';
  return t;
}

// 資料のタスクを取り込む：事業を8つに整理し、既存タスクに細目を足し、足りないタスクを追加する
async function importPdfTasks(r, me) {
  const prev = await loadTaskConfig();
  const byName = new Map(prev.categories.map((c) => [c.name, c]));
  const categories = TARGET_CATEGORIES.map(([name, company]) => {
    const old = byName.get(name) || (name === '整備工場' ? byName.get('整備') : null);
    return { id: old?.id || newId(), name, company };
  });
  const targetNames = new Set(categories.map((c) => c.name));
  for (const c of prev.categories) {
    if (!targetNames.has(c.name) && c.name !== '整備' && c.name !== 'HP・システム') categories.push(c);
  }
  await r.set(configKey(), { categories, assignees: prev.assignees });
  const companyOf = (name) => categories.find((c) => c.name === name)?.company || '3社共同';

  const ids = await r.smembers(idsKey);
  const tasks = await getMany(ids, 'task');
  const pdfByKey = new Map(PDF_TASKS.map((p) => [`${p[0]}|${p[1]}`, p]));
  const stamp = now();
  let updated = 0;
  let created = 0;
  const have = new Set();

  for (const t of tasks) {
    const title = ALIASES[t.title] || t.title;
    const p = pdfByKey.get(`${guessCategory(t.title, t.category)}|${title}`);
    let changed = false;
    if (p) {
      if (t.title !== p[1]) {
        t.title = p[1];
        changed = true;
      }
      if (t.category !== p[0]) {
        t.category = p[0];
        changed = true;
      }
      if (!Array.isArray(t.checklist) || t.checklist.length === 0) {
        t.checklist = p[3].map((text) => ({ id: newId(), text, done: t.status === '完了' }));
        changed = true;
      }
      have.add(`${p[0]}|${p[1]}`);
    } else {
      const cat = guessCategory(t.title, t.category);
      if (cat !== t.category) {
        t.category = cat;
        changed = true;
      }
      have.add(`${t.category}|${t.title}`);
    }
    const co = companyOf(t.category);
    if (t.company !== co) {
      t.company = co;
      changed = true;
    }
    if (changed) {
      t.updatedAt = stamp;
      await r.set(key('task', t.id), t);
      updated++;
    }
  }

  for (const [category, title, priority, items] of PDF_TASKS) {
    if (have.has(`${category}|${title}`)) continue;
    const t = {
      id: newId(),
      title,
      detail: '',
      category,
      company: companyOf(category),
      priority,
      status: '未着手',
      assigneeId: '',
      dueDate: '',
      checklist: items.map((text) => ({ id: newId(), text, done: false })),
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: me.id,
      completedAt: '',
      completedBy: '',
    };
    await r.set(key('task', t.id), t);
    await r.sadd(idsKey, t.id);
    created++;
  }
  return { created, updated };
}

export default withAuth(async (req, res, me) => {
  const r = redis();

  if (req.method === 'GET') {
    const ids = await r.smembers(idsKey);
    const tasks = await getMany(ids, 'task');
    return send(res, 200, { tasks });
  }

  if (req.method === 'POST') {
    if (req.query?.action === 'import') {
      if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ実行できます' });
      return send(res, 200, await importPdfTasks(r, me));
    }
    const input = body(req);
    if (!String(input.title || '').trim()) return send(res, 400, { error: 'タスク名を入力してください' });
    const cfg = await loadTaskConfig();
    const t = clean({ category: cfg.categories[0]?.name, priority: '中', status: '未着手', assigneeId: '', dueDate: '', detail: '', checklist: [], ...input }, cfg);
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
