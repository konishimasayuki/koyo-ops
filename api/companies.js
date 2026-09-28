import { body, key, now, redis, send, withAuth } from './_lib.js';

const COMPANY_KEY = key('companies');
const FIELDS = ['name', 'address', 'representative', 'corporateNumber', 'capital', 'established', 'fiscalMonth', 'note'];
const DEFAULTS = [
  {
    id: 'koyo',
    name: '浩洋国際株式会社',
    address: '〒869-1236 熊本県菊池郡大津町大字杉水838-149',
    representative: '代表取締役 清水 浩輝',
    corporateNumber: '',
    capital: '3,000万円',
    established: '平成28年5月26日',
    fiscalMonth: '',
    note: '',
  },
  { id: 'hayatex', name: 'HayateX株式会社', address: '', representative: '', corporateNumber: '', capital: '', established: '', fiscalMonth: '', note: '' },
  { id: 'gto', name: 'GTO株式会社', address: '', representative: '', corporateNumber: '', capital: '', established: '', fiscalMonth: '', note: '' },
];

async function load(r) {
  const cur = await r.get(COMPANY_KEY);
  if (cur) return cur;
  await r.set(COMPANY_KEY, DEFAULTS);
  return DEFAULTS;
}

function clean(input, base) {
  const c = { ...base };
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    const max = f === 'note' ? 2000 : 200;
    c[f] = String(input[f] ?? '')
      .trim()
      .slice(0, max);
  }
  if (c.corporateNumber) c.corporateNumber = c.corporateNumber.replace(/[^\d]/g, '').slice(0, 13);
  if (c.fiscalMonth && !/^(1[0-2]|[1-9])月$/.test(c.fiscalMonth)) c.fiscalMonth = '';
  return c;
}

// GET: 3社の会社情報 / PUT: 1社分の更新（管理者）
export default withAuth(async (req, res, me) => {
  const r = redis();
  if (req.method === 'GET') return send(res, 200, { companies: await load(r) });

  if (req.method === 'PUT') {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ変更できます' });
    const input = body(req);
    const list = await load(r);
    const i = list.findIndex((c) => c.id === input.id);
    if (i < 0) return send(res, 404, { error: '会社が見つかりません' });
    const next = clean(input, list[i]);
    if (!next.name) return send(res, 400, { error: '会社名を入力してください' });
    if (next.corporateNumber && next.corporateNumber.length !== 13) return send(res, 400, { error: '法人番号は13桁の数字で入力してください' });
    next.updatedAt = now();
    next.updatedBy = me.id;
    list[i] = next;
    await r.set(COMPANY_KEY, list);
    return send(res, 200, { company: next });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
