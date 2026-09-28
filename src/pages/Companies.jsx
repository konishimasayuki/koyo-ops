import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const COMPANY_CLASS = { koyo: 'c-koyo', hayatex: 'c-hx', gto: 'c-gto' };
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const ROWS = [
  ['name', '会社名'],
  ['address', '住所'],
  ['representative', '代表者'],
  ['corporateNumber', '法人番号'],
  ['capital', '資本金'],
  ['established', '設立'],
  ['fiscalMonth', '決算月'],
  ['note', '備考'],
];
const fmtCorp = (n) => (n && n.length === 13 ? `${n.slice(0, 1)}-${n.slice(1, 5)}-${n.slice(5, 9)}-${n.slice(9)}` : n);

export default function Companies({ me, onAuthError }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState('');
  const [copied, setCopied] = useState('');
  const isAdmin = me.role === 'admin';

  const load = useCallback(async () => {
    try {
      const r = await api.companies();
      setList(r.companies);
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

  const copy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      /* コピーできない環境では何もしない */
    }
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>会社情報</h1>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="muted pad">読み込み中…</p>
      ) : (
        <div className="co-cards">
          {list.map((c) =>
            editing === c.id ? (
              <CompanyForm
                key={c.id}
                company={c}
                onCancel={() => setEditing('')}
                onSaved={(n) => {
                  setList((l) => l.map((x) => (x.id === n.id ? n : x)));
                  setEditing('');
                }}
              />
            ) : (
              <article key={c.id} className="co-card">
                <div className="co-head">
                  <span className={`group-bar ${COMPANY_CLASS[c.id] || 'c-all'}`} aria-hidden="true" />
                  <h2>{c.name}</h2>
                  {isAdmin && (
                    <button type="button" className="btn ghost sm" onClick={() => setEditing(c.id)}>
                      編集
                    </button>
                  )}
                </div>
                <dl className="co-dl">
                  {ROWS.filter(([k]) => k !== 'name').map(([k, label]) => {
                    const v = k === 'corporateNumber' ? fmtCorp(c[k]) : c[k];
                    return (
                      <div key={k} className={k === 'note' ? 'wide' : ''}>
                        <dt>{label}</dt>
                        <dd>
                          {v ? (
                            <>
                              <span className="co-val">{v}</span>
                              {(k === 'corporateNumber' || k === 'address') && (
                                <button type="button" className="co-copy" onClick={() => copy(`${c.id}-${k}`, c[k])}>
                                  {copied === `${c.id}-${k}` ? 'コピー済み' : 'コピー'}
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="nil">未入力</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function CompanyForm({ company, onCancel, onSaved }) {
  const [f, setF] = useState(company);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setErr('');
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.updateCompany(f);
      onSaved(r.company);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };
  return (
    <form className="co-card editing" onSubmit={submit} noValidate>
      <div className="co-head">
        <h2>{company.name} を編集</h2>
      </div>
      <div className="grid2">
        <label>
          会社名
          <input value={f.name} onChange={set('name')} />
        </label>
        <label>
          代表者
          <input value={f.representative} onChange={set('representative')} placeholder="例）代表取締役 清水 浩輝" />
        </label>
        <label className="span2">
          住所
          <input value={f.address} onChange={set('address')} placeholder="例）〒869-1236 熊本県菊池郡大津町…" />
        </label>
        <label>
          法人番号（13桁）
          <input inputMode="numeric" value={f.corporateNumber} onChange={set('corporateNumber')} placeholder="例）1234567890123" />
        </label>
        <label>
          資本金
          <input value={f.capital} onChange={set('capital')} placeholder="例）3,000万円" />
        </label>
        <label>
          設立
          <input value={f.established} onChange={set('established')} placeholder="例）平成28年5月26日" />
        </label>
        <label>
          決算月
          <select value={f.fiscalMonth} onChange={set('fiscalMonth')}>
            <option value="">未設定</option>
            {MONTHS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="span2">
          備考
          <textarea rows={3} value={f.note} onChange={set('note')} placeholder="事業内容・許認可番号・取引銀行など" />
        </label>
      </div>
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <div className="modal-foot">
        <span />
        <div className="row-gap">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
          <button type="submit" className="btn gold" disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </form>
  );
}
