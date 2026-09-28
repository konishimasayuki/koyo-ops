import { body, getMany, key, newId, now, redis, send, withAuth } from './_lib.js';

const CATEGORIES = ['高級ミニバン', '高級セダン', 'ワゴン', 'ミニバン', 'コンパクト', '軽', '社用車', 'ピックアップ', 'バイク', 'トレーラー', '広告宣伝車', 'その他'];
const COMPANIES = ['浩洋国際', 'HayateX', 'GTO', '3社共同'];
const USES = ['レンタル', 'タクシー', 'アドトラック', 'キャンプ貸出', '販売・展示', '代車', '社用', '自家用', '未定'];
const STATUSES = ['稼働中', '準備中', '整備中', '不動', '売却検討'];

const idsKey = key('vehicles');
const pick = (v, list, def) => (list.includes(v) ? v : def);
const numOrEmpty = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : '';
};

function clean(input, base = {}) {
  const v = { ...base };
  const str = (k, max = 120) => {
    if (input[k] !== undefined)
      v[k] = String(input[k] ?? '')
        .trim()
        .slice(0, max);
  };
  str('model');
  str('plate', 40);
  str('color', 30);
  str('note', 1000);
  if (input.category !== undefined) v.category = pick(input.category, CATEGORIES, 'その他');
  if (input.company !== undefined) v.company = pick(input.company, COMPANIES, '浩洋国際');
  if (input.use !== undefined) v.use = pick(input.use, USES, '未定');
  if (input.status !== undefined) v.status = pick(input.status, STATUSES, '準備中');
  if (input.year !== undefined) v.year = numOrEmpty(input.year);
  if (input.mileage !== undefined) v.mileage = numOrEmpty(input.mileage);
  if (input.purchasePrice !== undefined) v.purchasePrice = numOrEmpty(input.purchasePrice);
  if (input.inspectionDate !== undefined) v.inspectionDate = /^\d{4}-\d{2}-\d{2}$/.test(input.inspectionDate || '') ? input.inspectionDate : '';
  return v;
}

const blank = {
  category: 'その他',
  model: '',
  plate: '',
  color: '',
  company: '浩洋国際',
  use: '未定',
  status: '準備中',
  year: '',
  inspectionDate: '',
  mileage: '',
  purchasePrice: '',
  note: '',
};

export default withAuth(async (req, res, me) => {
  const r = redis();

  if (req.method === 'GET') {
    const ids = await r.smembers(idsKey);
    const vehicles = await getMany(ids, 'vehicle');
    return send(res, 200, { vehicles, options: { categories: CATEGORIES, companies: COMPANIES, uses: USES, statuses: STATUSES } });
  }

  if (req.method === 'POST') {
    const input = body(req);
    if (!String(input.model || '').trim()) return send(res, 400, { error: '車種を入力してください' });
    const v = clean({ ...blank, ...input });
    const stamp = now();
    Object.assign(v, { id: newId(), createdAt: stamp, updatedAt: stamp, createdBy: me.id });
    await r.set(key('vehicle', v.id), v);
    await r.sadd(idsKey, v.id);
    return send(res, 201, { vehicle: v });
  }

  if (req.method === 'PUT') {
    const input = body(req);
    const cur = input.id ? await r.get(key('vehicle', input.id)) : null;
    if (!cur) return send(res, 404, { error: '車両が見つかりません' });
    const v = clean(input, cur);
    if (!v.model) return send(res, 400, { error: '車種を入力してください' });
    v.updatedAt = now();
    v.updatedBy = me.id;
    await r.set(key('vehicle', v.id), v);
    return send(res, 200, { vehicle: v });
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id || body(req).id;
    if (!id) return send(res, 400, { error: 'IDがありません' });
    await r.del(key('vehicle', id));
    await r.srem(idsKey, id);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
