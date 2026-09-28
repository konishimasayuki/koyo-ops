import { COMPANIES, body, getMany, key, newId, now, redis, send, withAuth } from './_lib.js';

// ファイルはブラウザで base64 にして、約700KBずつ分けて保存する（Vercelの送受信上限4.5MB対策）
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_CHUNKS = 40;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'];
const idsKey = key('docs');
const chunkKey = (id, i) => key('docchunk', id, String(i));

const cleanMeta = (input, base = {}) => {
  const d = { ...base };
  if (input.name !== undefined) d.name = String(input.name).trim().slice(0, 120);
  if (input.company !== undefined) d.company = COMPANIES.includes(input.company) ? input.company : '3社共同';
  if (input.note !== undefined) d.note = String(input.note).slice(0, 1000);
  return d;
};

async function removeChunks(r, doc) {
  for (let i = 0; i < (doc.chunks || 0); i++) await r.del(chunkKey(doc.id, i));
}

export default withAuth(async (req, res, me) => {
  const r = redis();
  const q = req.query || {};

  if (req.method === 'GET') {
    if (q.id && q.chunk !== undefined) {
      const data = await r.get(chunkKey(q.id, Number(q.chunk)));
      if (data === null || data === undefined) return send(res, 404, { error: 'ファイルが見つかりません' });
      return send(res, 200, { data });
    }
    const ids = await r.smembers(idsKey);
    const docs = (await getMany(ids, 'doc')).filter((d) => d.status === 'ready');
    return send(res, 200, { docs, companies: COMPANIES });
  }

  if (req.method === 'POST') {
    // 仕上げ：すべての分割が届いたら公開する
    if (q.action === 'finish') {
      const doc = await r.get(key('doc', q.id));
      if (!doc) return send(res, 404, { error: '資料が見つかりません' });
      for (let i = 0; i < doc.chunks; i++) {
        if ((await r.exists(chunkKey(doc.id, i))) === 0) return send(res, 400, { error: 'アップロードが途中で止まっています。もう一度お試しください' });
      }
      doc.status = 'ready';
      await r.set(key('doc', doc.id), doc);
      return send(res, 200, { doc });
    }
    const input = body(req);
    const d = cleanMeta({ company: '3社共同', note: '', ...input });
    if (!d.name) return send(res, 400, { error: '名称を入力してください' });
    const mime = String(input.mime || '');
    const size = Number(input.size || 0);
    const chunks = Number(input.chunks || 0);
    if (!TYPES.includes(mime)) return send(res, 400, { error: '写真（JPEG・PNG・WebP・HEIC）かPDFを選んでください' });
    if (!size || size > MAX_BYTES) return send(res, 400, { error: 'ファイルは20MBまでです' });
    if (!chunks || chunks > MAX_CHUNKS) return send(res, 400, { error: 'ファイルの分割数が不正です' });
    Object.assign(d, {
      id: newId(),
      fileName: String(input.fileName || 'file').slice(0, 160),
      mime,
      size,
      chunks,
      thumb: typeof input.thumb === 'string' && input.thumb.startsWith('data:image/') && input.thumb.length < 60000 ? input.thumb : '',
      status: 'uploading',
      createdAt: now(),
      createdBy: me.id,
    });
    await r.set(key('doc', d.id), d);
    await r.sadd(idsKey, d.id);
    return send(res, 201, { doc: d });
  }

  if (req.method === 'PUT') {
    // 分割データの保存
    if (q.id && q.chunk !== undefined) {
      const doc = await r.get(key('doc', q.id));
      if (!doc) return send(res, 404, { error: '資料が見つかりません' });
      const i = Number(q.chunk);
      if (!Number.isInteger(i) || i < 0 || i >= doc.chunks) return send(res, 400, { error: '分割番号が不正です' });
      const { data } = body(req);
      if (typeof data !== 'string' || data.length > 1_000_000) return send(res, 400, { error: 'データが不正です' });
      await r.set(chunkKey(doc.id, i), data);
      return send(res, 200, { ok: true });
    }
    const input = body(req);
    const cur = input.id ? await r.get(key('doc', input.id)) : null;
    if (!cur) return send(res, 404, { error: '資料が見つかりません' });
    const d = cleanMeta(input, cur);
    if (!d.name) return send(res, 400, { error: '名称を入力してください' });
    d.updatedAt = now();
    d.updatedBy = me.id;
    await r.set(key('doc', d.id), d);
    return send(res, 200, { doc: d });
  }

  if (req.method === 'DELETE') {
    const id = q.id || body(req).id;
    const doc = id ? await r.get(key('doc', id)) : null;
    if (!doc) return send(res, 404, { error: '資料が見つかりません' });
    await removeChunks(r, doc);
    await r.del(key('doc', id));
    await r.srem(idsKey, id);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
