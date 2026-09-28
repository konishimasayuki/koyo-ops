import { COMPANIES, body, getMany, key, newId, now, redis, send, withAuth } from './_lib.js';

const idsKey = key('events');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function clean(input, base = {}) {
  const e = { ...base };
  if (input.title !== undefined) e.title = String(input.title).trim().slice(0, 120);
  if (input.location !== undefined) e.location = String(input.location).trim().slice(0, 200);
  if (input.memo !== undefined) e.memo = String(input.memo).slice(0, 2000);
  if (input.company !== undefined) e.company = COMPANIES.includes(input.company) ? input.company : '3社共同';
  if (input.assigneeId !== undefined) e.assigneeId = String(input.assigneeId || '');
  if (input.allDay !== undefined) e.allDay = !!input.allDay;
  if (input.start !== undefined) e.start = String(input.start);
  if (input.end !== undefined) e.end = String(input.end);
  return e;
}

function check(e) {
  if (!e.title) return 'タイトルを入力してください';
  const re = e.allDay ? DATE : DATETIME;
  if (!re.test(e.start || '') || !re.test(e.end || '')) return '日時の形式が正しくありません';
  if (e.end < e.start) return '終了は開始より後にしてください';
  return '';
}

// 日付の範囲（from〜to）に重なる予定だけ返す
const overlaps = (e, from, to) => {
  const s = e.start.slice(0, 10);
  const en = e.end.slice(0, 10);
  return (!to || s <= to) && (!from || en >= from);
};

export default withAuth(async (req, res, me) => {
  const r = redis();
  const q = req.query || {};

  if (req.method === 'GET') {
    const ids = await r.smembers(idsKey);
    const events = (await getMany(ids, 'event')).filter((e) => overlaps(e, q.from, q.to));
    return send(res, 200, { events });
  }

  if (req.method === 'POST') {
    const e = clean({ company: '3社共同', assigneeId: '', location: '', memo: '', allDay: false, ...body(req) });
    const msg = check(e);
    if (msg) return send(res, 400, { error: msg });
    const stamp = now();
    Object.assign(e, { id: newId(), createdAt: stamp, updatedAt: stamp, createdBy: me.id });
    await r.set(key('event', e.id), e);
    await r.sadd(idsKey, e.id);
    return send(res, 201, { event: e });
  }

  if (req.method === 'PUT') {
    const input = body(req);
    const cur = input.id ? await r.get(key('event', input.id)) : null;
    if (!cur) return send(res, 404, { error: '予定が見つかりません' });
    const e = clean(input, cur);
    const msg = check(e);
    if (msg) return send(res, 400, { error: msg });
    e.updatedAt = now();
    e.updatedBy = me.id;
    await r.set(key('event', e.id), e);
    return send(res, 200, { event: e });
  }

  if (req.method === 'DELETE') {
    const id = q.id || body(req).id;
    if (!id) return send(res, 400, { error: 'IDがありません' });
    await r.del(key('event', id));
    await r.srem(idsKey, id);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
