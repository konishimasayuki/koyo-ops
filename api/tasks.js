import { body, getMany, key, newId, now, redis, send, withAuth } from './_lib.js';

export const CATEGORIES = ['共通', 'レンタカー', 'スパイダー', 'タクシー', 'アドトラック', 'キャンプトレーラー', '整備', 'トレーラー販売', 'HP・システム'];
const STATUSES = ['未着手', '進行中', '完了'];
const PRIORITIES = ['高', '中', '低'];
const COMPANY = { レンタカー: '浩洋国際', スパイダー: '浩洋国際', タクシー: 'HayateX', アドトラック: 'GTO' };
const companyOf = (cat) => COMPANY[cat] || '3社共同';

// 開業準備タスク（戦略資料のPART 2）の初期データ
const SEED = [
  ['共通', '工場内レイアウトの策定', '洗車・受付・倉庫・トイレ・看板', '高'],
  ['共通', '車両一覧の完成', '年式・車検期限・購入価格・走行距離を全台記入', '高'],
  ['共通', '保険の設計', '事業用任意保険・車両保険・免責補償', '高'],
  ['HP・システム', '予約・車両管理システムの要件整理', '予約・配車・整備記録・顧客管理を一元化', '中'],
  ['共通', '3社のブランド方針', 'ロゴ・色・書体の使い方をそろえる', '中'],
  ['アドトラック', '保有車両の仕様確認', '車種・サイズ・映像設備・車検期限', '中'],
  ['アドトラック', '法規制・走行規制の調査', '屋外広告物条例・騒音・道路使用許可・免許区分', '高'],
  ['アドトラック', '他社の料金調査', '半日・1日・連日・月極め、運転手付きとの差', '高'],
  ['アドトラック', '場所・イベントの需要調査', '熊本・福岡の祭り・催事カレンダー、巡回ルート', '中'],
  ['アドトラック', '1日あたりの原価の算出', '燃料・人件費・保険・減価償却・機材', '中'],
  ['アドトラック', '映像・スピーカーの拡張性の調査', 'LEDの仕様、映像の差し替え、音響連携', '低'],
  ['HP・システム', 'アドトラックのHP・LP作成', '料金表・実績・見積フォーム', '中'],
  ['アドトラック', '営業用PDF・動画の作成', '料金・事例・実走行の動画', '中'],
  ['レンタカー', '競合各社の料金調査', 'ベンツ・ハイエース・アルファード、法人月極め、貸切', '高'],
  ['レンタカー', '車両の状態・原価リストの作成', '傷・内装・タイヤの確認、月間固定費', '高'],
  ['レンタカー', '車種ごとの需要調査', '法人・式場・団体・インバウンド', '中'],
  ['HP・システム', 'レンタカーHP（国内向け）の作成', '車種ギャラリー・料金表・予約フォーム', '高'],
  ['HP・システム', 'レンタカーHP（海外向け）の作成', '英語・繁体字・韓国語', '低'],
  ['レンタカー', '業務マニュアルの策定', '予約〜貸渡〜返却、チェックシート、事故・盗難対応、約款', '中'],
  ['レンタカー', '料金案内の作成', '時間・日・週・月の料金表とオプション', '高'],
  ['スパイダー', 'スパイダーのレンタル商品化', '専用HP・チラシ・料金表・ルートマップ・備品', '高'],
  ['キャンプトレーラー', 'キャンプトレーラーの案内づくり', 'チラシ・利用の流れ・牽引講習・キャンプ場との提携', '中'],
  ['タクシー', 'デカール・メーター・行灯の取付', '緑ナンバー登録・施工業者の手配', '高'],
  ['タクシー', '無線機・配車の準備', 'IP無線・配車アプリの比較', '中'],
  ['タクシー', 'コールセンターの設置', '受付時間・電話番号・定期予約の受付ルール', '中'],
  ['タクシー', '料金設定', '公示運賃・空港定額・観光タクシー・貸切', '中'],
  ['タクシー', 'ドライバー採用', '二種免許保有者の募集・取得支援', '高'],
  ['整備', '整備工場の認証申請', '整備主任者・設備基準の確認', '中'],
];

const idsKey = key('tasks');

function clean(input, base = {}) {
  const t = { ...base };
  if (input.title !== undefined) t.title = String(input.title).trim().slice(0, 120);
  if (input.detail !== undefined) t.detail = String(input.detail).slice(0, 2000);
  if (input.category !== undefined) t.category = CATEGORIES.includes(input.category) ? input.category : '共通';
  if (input.priority !== undefined) t.priority = PRIORITIES.includes(input.priority) ? input.priority : '中';
  if (input.status !== undefined) t.status = STATUSES.includes(input.status) ? input.status : '未着手';
  if (input.assigneeId !== undefined) t.assigneeId = input.assigneeId || '';
  if (input.dueDate !== undefined) t.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || '') ? input.dueDate : '';
  t.company = companyOf(t.category);
  return t;
}

export default withAuth(async (req, res, me) => {
  const r = redis();

  if (req.method === 'GET') {
    const ids = await r.smembers(idsKey);
    const tasks = await getMany(ids, 'task');
    return send(res, 200, { tasks, categories: CATEGORIES });
  }

  if (req.method === 'POST') {
    // 初期タスクの取り込み（管理者・1回だけ）
    if (req.query?.action === 'seed') {
      if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ実行できます' });
      if (await r.get(key('seeded', 'tasks'))) return send(res, 409, { error: '初期タスクは取り込み済みです' });
      const stamp = now();
      for (const [category, title, detail, priority] of SEED) {
        const t = clean({ category, title, detail, priority, status: '未着手', assigneeId: '', dueDate: '' });
        Object.assign(t, { id: newId(), createdAt: stamp, updatedAt: stamp, createdBy: me.id, completedAt: '', completedBy: '' });
        await r.set(key('task', t.id), t);
        await r.sadd(idsKey, t.id);
      }
      await r.set(key('seeded', 'tasks'), stamp);
      return send(res, 201, { count: SEED.length });
    }
    const input = body(req);
    if (!String(input.title || '').trim()) return send(res, 400, { error: 'タスク名を入力してください' });
    const t = clean({ category: '共通', priority: '中', status: '未着手', assigneeId: '', dueDate: '', detail: '', ...input });
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
    const t = clean(input, cur);
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
