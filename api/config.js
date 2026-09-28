import { COMPANIES, body, getMany, key, loadTaskConfig, newId, redis, send, withAuth } from './_lib.js';

const cleanName = (s) =>
  String(s ?? '')
    .trim()
    .slice(0, 40);

function validate(list, label) {
  const names = new Set();
  for (const item of list) {
    if (!item.name) return `${label}の名前を入力してください`;
    if (names.has(item.name)) return `${label}「${item.name}」が重複しています`;
    names.add(item.name);
  }
  return '';
}

export default withAuth(async (req, res, me) => {
  const r = redis();

  if (req.method === 'GET') {
    return send(res, 200, { config: await loadTaskConfig(), companies: COMPANIES });
  }

  if (req.method === 'PUT') {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ変更できます' });
    const input = body(req);
    const prev = await loadTaskConfig();
    const categories = (Array.isArray(input.categories) ? input.categories : []).map((c) => ({
      id: c.id || newId(),
      name: cleanName(c.name),
      company: COMPANIES.includes(c.company) ? c.company : '3社共同',
    }));
    const assignees = (Array.isArray(input.assignees) ? input.assignees : []).map((a) => ({ id: a.id || newId(), name: cleanName(a.name) }));
    const errMsg = validate(categories, '事業') || validate(assignees, '担当者') || (categories.length === 0 ? '事業を1つ以上登録してください' : '');
    if (errMsg) return send(res, 400, { error: errMsg });

    const taskIds = await r.smembers(key('tasks'));
    const tasks = await getMany(taskIds, 'task');
    const nextById = new Map(categories.map((c) => [c.id, c]));

    // 削除される事業にタスクが残っていたら止める
    for (const old of prev.categories) {
      if (nextById.has(old.id)) continue;
      const n = tasks.filter((t) => t.category === old.name).length;
      if (n > 0) return send(res, 409, { error: `事業「${old.name}」にはタスクが${n}件あるため削除できません。先にタスクの事業を変えてください` });
    }

    // 事業名・会社の変更と、削除された担当者をタスクへ反映する
    const renamed = new Map();
    for (const old of prev.categories) {
      const nx = nextById.get(old.id);
      if (nx && (nx.name !== old.name || nx.company !== old.company)) renamed.set(old.name, nx);
    }
    const alive = new Set(assignees.map((a) => a.id));
    for (const t of tasks) {
      let changed = false;
      const nx = renamed.get(t.category);
      if (nx) {
        t.category = nx.name;
        t.company = nx.company;
        changed = true;
      }
      if (t.assigneeId && !alive.has(t.assigneeId)) {
        t.assigneeId = '';
        changed = true;
      }
      if (changed) await r.set(key('task', t.id), t);
    }

    const cfg = { categories, assignees };
    await r.set(key('config', 'tasks'), cfg);
    return send(res, 200, { config: cfg, companies: COMPANIES });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
