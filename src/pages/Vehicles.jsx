import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

const CATEGORIES = ['高級ミニバン', '高級セダン', 'ワゴン', 'ミニバン', 'コンパクト', '軽', '社用車', 'ピックアップ', 'バイク', 'トレーラー', '広告宣伝車', 'その他'];
const COMPANIES = ['浩洋国際', 'HayateX', 'GTO', '3社共同'];
const USES = ['レンタル', 'タクシー', 'アドトラック', 'キャンプ貸出', '販売・展示', '代車', '社用', '自家用', '未定'];
const STATUSES = ['稼働中', '準備中', '整備中', '不動', '売却検討'];
const COMPANY_CLASS = { 浩洋国際: 'c-koyo', HayateX: 'c-hx', GTO: 'c-gto', '3社共同': 'c-all' };
const EMPTY = {
  category: '高級ミニバン',
  model: '',
  plate: '',
  color: '',
  company: '浩洋国際',
  use: 'レンタル',
  status: '準備中',
  year: '',
  inspectionDate: '',
  mileage: '',
  purchasePrice: '',
  note: '',
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const fmtDate = (s) => (s ? `${s.slice(0, 4)}/${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : '');
const fmtNum = (n) => (n === '' || n === undefined || n === null ? '' : Number(n).toLocaleString('ja-JP'));
const shakenState = (v, today, soon) => {
  if (!v.inspectionDate) return '';
  if (v.inspectionDate < today) return 'expired';
  if (v.inspectionDate <= soon) return 'soon';
  return '';
};
const isMissing = (v) => !v.year || !v.inspectionDate || v.mileage === '' || v.mileage === undefined;

export default function Vehicles({ onAuthError }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('all');
  const [cat, setCat] = useState('');
  const [co, setCo] = useState('');
  const [st, setSt] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.vehicles();
      setList(r.vehicles);
    } catch (e) {
      onAuthError(e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  const today = ymd(new Date());
  const soon = inDays(30);

  const counts = useMemo(
    () => ({
      all: list.length,
      active: list.filter((v) => v.status === '稼働中').length,
      shaken: list.filter((v) => shakenState(v, today, soon)).length,
      missing: list.filter(isMissing).length,
    }),
    [list, today, soon],
  );

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return list
      .filter((v) => (view === 'active' ? v.status === '稼働中' : view === 'shaken' ? !!shakenState(v, today, soon) : view === 'missing' ? isMissing(v) : true))
      .filter((v) => !cat || v.category === cat)
      .filter((v) => !co || v.company === co)
      .filter((v) => !st || v.status === st)
      .filter((v) => !kw || `${v.model} ${v.plate} ${v.color} ${v.note}`.toLowerCase().includes(kw))
      .sort((a, b) => {
        if (view === 'shaken') return String(a.inspectionDate).localeCompare(String(b.inspectionDate));
        return CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.model.localeCompare(b.model, 'ja') || String(a.plate).localeCompare(String(b.plate), 'ja');
      });
  }, [list, view, cat, co, st, q, today, soon]);

  const save = async (form) => {
    const r = form.id ? await api.updateVehicle(form) : await api.addVehicle(form);
    setList((all) => (form.id ? all.map((x) => (x.id === r.vehicle.id ? r.vehicle : x)) : [...all, r.vehicle]));
    setEditing(null);
  };

  const remove = async (id) => {
    await api.deleteVehicle(id);
    setList((all) => all.filter((x) => x.id !== id));
    setEditing(null);
  };

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>車両一覧</h1>
          <p className="muted">3社の保有車両と、車検期限・状態を管理します。</p>
        </div>
        <button type="button" className="btn gold" onClick={() => setEditing({ ...EMPTY })}>
          ＋ 車両を追加
        </button>
      </div>

      <div className="stats">
        <button type="button" className={`stat${view === 'all' ? ' on' : ''}`} onClick={() => setView('all')}>
          <b>{counts.all}</b>
          <span>保有台数</span>
          <small>すべての車両</small>
        </button>
        <button type="button" className={`stat ok${view === 'active' ? ' on' : ''}`} onClick={() => setView('active')}>
          <b>{counts.active}</b>
          <span>稼働中</span>
          <small>貸出・運行できる車両</small>
        </button>
        <button type="button" className={`stat warn${view === 'shaken' ? ' on' : ''}`} onClick={() => setView('shaken')}>
          <b>{counts.shaken}</b>
          <span>車検が近い</span>
          <small>30日以内・期限切れ</small>
        </button>
        <button type="button" className={`stat${view === 'missing' ? ' on' : ''}`} onClick={() => setView('missing')}>
          <b>{counts.missing}</b>
          <span>情報が未入力</span>
          <small>年式・車検期限・走行距離</small>
        </button>
      </div>

      <div className="filters f4">
        <input className="search" placeholder="車種・ナンバー・メモで検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="区分で絞り込む">
          <option value="">すべての区分</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={co} onChange={(e) => setCo(e.target.value)} aria-label="会社で絞り込む">
          <option value="">すべての会社</option>
          {COMPANIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="状態で絞り込む">
          <option value="">すべての状態</option>
          {STATUSES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted pad">読み込み中…</p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>表示する車両はありません。</p>
        </div>
      ) : (
        <div className="vscroll">
          <table className="vt">
            <thead>
              <tr>
                <th className="stick">車種</th>
                <th>ナンバー</th>
                <th>区分</th>
                <th>色</th>
                <th>所属会社</th>
                <th>用途</th>
                <th>状態</th>
                <th>年式</th>
                <th>車検期限</th>
                <th className="num">走行距離</th>
                <th className="num">購入価格</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => {
                const sk = shakenState(v, today, soon);
                return (
                  <tr key={v.id} className={sk ? `sk-${sk}` : ''} onClick={() => setEditing(v)}>
                    <td className="stick">
                      <button type="button" className="vt-link" onClick={() => setEditing(v)}>
                        {v.model}
                      </button>
                    </td>
                    <td>
                      <span className={`plate${v.use === 'タクシー' ? ' green' : ''}${v.plate ? '' : ' none'}`}>{v.plate || 'ナンバーなし'}</span>
                    </td>
                    <td>{v.category}</td>
                    <td>{v.color}</td>
                    <td>
                      <span className={`tag ${COMPANY_CLASS[v.company] || 'c-all'}`}>{v.company}</span>
                    </td>
                    <td>{v.use}</td>
                    <td>
                      <span className={`vst vst-${v.status}`}>{v.status}</span>
                    </td>
                    <td>{v.year ? `${v.year}年` : <span className="nil">未入力</span>}</td>
                    <td className={sk ? `v-shaken ${sk}` : ''}>
                      {v.inspectionDate ? fmtDate(v.inspectionDate) : <span className="nil">未入力</span>}
                      {sk === 'expired' && <small>期限切れ</small>}
                      {sk === 'soon' && <small>30日以内</small>}
                    </td>
                    <td className="num">{v.mileage !== '' && v.mileage !== undefined ? `${fmtNum(v.mileage)} km` : <span className="nil">未入力</span>}</td>
                    <td className="num">{v.purchasePrice !== '' && v.purchasePrice !== undefined ? `${fmtNum(v.purchasePrice)} 円` : <span className="nil">未入力</span>}</td>
                    <td className="memo">{v.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <VehicleModal vehicle={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </section>
  );
}

function VehicleModal({ vehicle, onClose, onSave, onDelete }) {
  const confirm = useConfirm();
  const [f, setF] = useState(vehicle);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setErr('');
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!String(f.model).trim()) {
      setErr('車種を入力してください');
      return;
    }
    setBusy(true);
    try {
      await onSave(f);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  const del = async () => {
    if (!(await confirm(`「${f.model}（${f.plate || 'ナンバーなし'}）」を削除します。よろしいですか？`, { ok: '削除する', danger: true }))) return;
    setBusy(true);
    try {
      await onDelete(f.id);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-veil" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2>{f.id ? '車両の編集' : '車両を追加'}</h2>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="grid2">
          <label>
            車種
            <input value={f.model} onChange={set('model')} autoFocus placeholder="例）ヴェルファイア" />
          </label>
          <label>
            ナンバー
            <input value={f.plate} onChange={set('plate')} placeholder="例）熊本300 わ949" />
          </label>
          <label>
            区分
            <select value={f.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            色
            <input value={f.color} onChange={set('color')} placeholder="例）黒" />
          </label>
          <label>
            所属会社
            <select value={f.company} onChange={set('company')}>
              {COMPANIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            用途
            <select value={f.use} onChange={set('use')}>
              {USES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            年式
            <input inputMode="numeric" value={f.year} onChange={set('year')} placeholder="例）2023" />
          </label>
          <label>
            車検期限
            <input type="date" value={f.inspectionDate} onChange={set('inspectionDate')} />
          </label>
          <label>
            走行距離（km）
            <input inputMode="numeric" value={f.mileage} onChange={set('mileage')} placeholder="例）25000" />
          </label>
          <label>
            購入価格（円）
            <input inputMode="numeric" value={f.purchasePrice} onChange={set('purchasePrice')} placeholder="例）6500000" />
          </label>
        </div>
        <div className="seg s5" role="group" aria-label="状態">
          {STATUSES.map((s) => (
            <button key={s} type="button" className={f.status === s ? 'on' : ''} onClick={() => setF((x) => ({ ...x, status: s }))}>
              {s}
            </button>
          ))}
        </div>
        <label>
          メモ
          <textarea rows={3} value={f.note} onChange={set('note')} placeholder="装備・傷・タイヤの状態など" />
        </label>
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
        <div className="modal-foot">
          {f.id ? (
            <button type="button" className="btn danger-ghost" onClick={del} disabled={busy}>
              削除
            </button>
          ) : (
            <span />
          )}
          <div className="row-gap">
            <button type="button" className="btn ghost" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn gold" disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
