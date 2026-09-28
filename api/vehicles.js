import { body, getMany, key, newId, now, redis, send, withAuth } from './_lib.js';

const CATEGORIES = ['高級ミニバン', '高級セダン', 'ワゴン', 'ミニバン', 'コンパクト', '軽', '社用車', 'ピックアップ', 'バイク', 'トレーラー', '広告宣伝車', 'その他'];
const COMPANIES = ['浩洋国際', 'HayateX', 'GTO', '3社共同'];
const USES = ['レンタル', 'タクシー', 'アドトラック', 'キャンプ貸出', '販売・展示', '代車', '社用', '自家用', '未定'];
const STATUSES = ['稼働中', '準備中', '整備中', '不動', '売却検討'];

// 戦略資料の車両一覧（37台＋アドトラック）
const SEED = [
  ['高級ミニバン', '現行ヴェルファイア', '熊本300 わ949', '黒', '浩洋国際', 'レンタル', '稼働中', 'レンタル主力'],
  ['高級ミニバン', '現行ヴェルファイア', '熊本350 つ999', '黒', '浩洋国際', '自家用', '準備中', 'レンタルに使うならわナンバーへ'],
  ['高級ミニバン', 'ヴェルファイア', '熊本337 わ999', '白', '浩洋国際', 'レンタル', '稼働中', ''],
  ['高級ミニバン', 'ヴェルファイア', '熊本340 わ999', '白', '浩洋国際', 'レンタル', '稼働中', ''],
  ['高級ミニバン', 'ヴェルファイア', '熊本339 わ999', '白', '浩洋国際', 'レンタル', '稼働中', ''],
  ['高級ミニバン', 'ヴェルファイア', '熊本334 わ999', '白', '浩洋国際', 'レンタル', '稼働中', ''],
  ['高級ミニバン', 'ヴェルファイア', '熊本349 ら999', '白', '浩洋国際', '自家用', '準備中', 'レンタルに使うならわナンバーへ'],
  ['高級ミニバン', 'ヴェルファイア', '熊本335 わ999', '黒', 'HayateX', 'タクシー', '準備中', '緑ナンバー登録・デカール・メーター取付'],
  ['高級ミニバン', 'アルファード', '熊本332 わ999', 'ガンメタ', '浩洋国際', 'レンタル', '稼働中', ''],
  ['高級ミニバン', 'アルファード', '熊本300 わ8159', '白', '浩洋国際', 'レンタル', '稼働中', ''],
  ['高級ミニバン', 'アルファード', '熊本300 わ8160', '黒', '浩洋国際', '未定', '不動', '修理か売却か判断'],
  ['高級セダン', 'ロールスロイス', '福岡32ぴ ひ9', '', '浩洋国際', '自家用', '準備中', '結婚式・撮影向け'],
  ['高級セダン', 'メルセデス E220', '熊本338 わ999', '白', '浩洋国際', 'レンタル', '稼働中', ''],
  ['高級セダン', 'メルセデス S300h L', '熊本331 わ999', 'シルバー', 'HayateX', 'タクシー', '準備中', '緑ナンバー登録・デカール・メーター取付'],
  ['ワゴン', 'ハイエース', '熊本336 わ999', 'シルバー', '浩洋国際', 'レンタル', '稼働中', '団体・遠征'],
  ['ワゴン', 'ハイエース', '熊本333 わ999', 'シルバー', 'HayateX', 'タクシー', '準備中', '緑ナンバー登録・デカール・メーター取付'],
  ['ワゴン', 'キャラバン', '熊本200 さ2889', '', '浩洋国際', '未定', '準備中', '用途未定'],
  ['ミニバン', 'ヴォクシー', '熊本300 わ8131', '黒', '浩洋国際', 'レンタル', '稼働中', ''],
  ['コンパクト', 'シエンタ', '熊本502 わ7157', '白', '浩洋国際', 'レンタル', '稼働中', '代車にも使う'],
  ['コンパクト', 'タンク', '熊本502 わ8761', '白', '浩洋国際', 'レンタル', '稼働中', '代車にも使う'],
  ['コンパクト', 'ルーミー', '熊本502 わ6970', '青', '浩洋国際', 'レンタル', '稼働中', '代車にも使う'],
  ['コンパクト', 'ソリオ', '熊本502 む6002', '青', '浩洋国際', '代車', '準備中', '自家用ナンバー'],
  ['コンパクト', 'ノート', '', 'シルバー', '浩洋国際', '未定', '準備中', 'ナンバーなし。登録するか判断'],
  ['軽', 'N-BOX', '熊本582 ひ1076', '黒', '浩洋国際', '代車', '準備中', '代車・社用候補'],
  ['社用車', '30プリウス', '熊本301 や592', '赤', '3社共同', '社用', '稼働中', '社用車へ名義変更'],
  ['ピックアップ', 'トライトン（要確認）', '福岡131 す999', 'オレンジ', '3社共同', '自家用', '準備中', '牽引車候補。車種名を確認'],
  ['バイク', 'Ninja400', '', '', '浩洋国際', '未定', '準備中', 'ナンバーなし。ツーリングレンタル候補'],
  ['バイク', 'Ninja400', '', '', '浩洋国際', '未定', '準備中', 'ナンバーなし。ツーリングレンタル候補'],
  ['バイク', 'BRPスパイダー', '熊本 ろ665', '', '浩洋国際', 'レンタル', '準備中', '阿蘇ツーリング'],
  ['バイク', 'BRPスパイダー', '熊本 ろ666', '', '浩洋国際', 'レンタル', '準備中', '阿蘇ツーリング'],
  ['バイク', 'BRPスパイダー', '熊本 ろ667', '', '浩洋国際', 'レンタル', '準備中', '阿蘇ツーリング'],
  ['バイク', 'BRPスパイダー', '熊本 ろ681', '', '浩洋国際', 'レンタル', '準備中', '阿蘇ツーリング'],
  ['トレーラー', 'キャンピングトレーラー', '熊本830 わ999', '', '3社共同', 'キャンプ貸出', '準備中', ''],
  ['トレーラー', 'キャンピングトレーラー', '熊本832 わ999', '', '3社共同', 'キャンプ貸出', '準備中', ''],
  ['トレーラー', 'トレーラー', '熊本131 わ999', '黒', '3社共同', '販売・展示', '準備中', '貸出・販売の見本'],
  ['トレーラー', 'トレーラー', '熊本130 わ999', '白', '3社共同', '販売・展示', '準備中', '貸出・販売の見本'],
  ['トレーラー', 'ミニトレーラー', '福岡480 を157', '', '3社共同', '自家用', '準備中', ''],
  ['広告宣伝車', 'アドトラック', '', '', 'GTO', 'アドトラック', '稼働中', '保有済み。車種・ナンバー・映像設備を追記'],
];

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
    if (req.query?.action === 'seed') {
      if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ実行できます' });
      if (await r.get(key('seeded', 'vehicles'))) return send(res, 409, { error: '保有車両は取り込み済みです' });
      const stamp = now();
      for (const [category, model, plate, color, company, use, status, note] of SEED) {
        const v = clean({ ...blank, category, model, plate, color, company, use, status, note });
        Object.assign(v, { id: newId(), createdAt: stamp, updatedAt: stamp, createdBy: me.id });
        await r.set(key('vehicle', v.id), v);
        await r.sadd(idsKey, v.id);
      }
      await r.set(key('seeded', 'vehicles'), stamp);
      return send(res, 201, { count: SEED.length });
    }
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
