import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const STATUSES = ['未着手', '進行中', '完了'];
const PRIORITIES = ['高', '中', '低'];
const PRI_ORDER = { 高: 0, 中: 1, 低: 2 };
const COMPANY_CLASS = { 浩洋国際: 'c-koyo', HayateX: 'c-hx', GTO: 'c-gto', '3社共同': 'c-all' };
const VIEWS = [
  ['open', '未完了'],
  ['done', '完了'],
  ['all', 'すべて'],
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const overdueOn = (t, day) => t.status !== '完了' && !!t.dueDate && t.dueDate < day;
const fmtDate = (s) => (s ? `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}` : '');
const fmtStamp = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const byDue = (a, b) =>
  (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || String(a.createdAt).localeCompare(String(b.createdAt));

export default function Tasks({ me, onAuthError }) {
  const [tasks, setTasks] = useState([]);
  const [cfg, setCfg] = useState({ categories: [], assignees: [] });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('open');
  const [cat, setCat] = useState('');
  const [who, setWho] = useState('');
  const [folded, setFolded] = useState({});
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [t, c, u] = await Promise.all([api.tasks(), api.taskConfig(), api.users()]);
      setTasks(t.tasks);
      setCfg(c.config);
      setUsers(u.users);
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

  const t0 = today();
  const assigneeName = useCallback((id) => cfg.assignees.find((a) => a.id === id)?.name || '', [cfg]);
  const userName = useCallback((id) => users.find((u) => u.id === id)?.name || '', [users]);
  const companyOf = useCallback((name) => cfg.categories.find((c) => c.name === name)?.company || '3社共同', [cfg]);

  // 事業ごとにまとめる（設定の並び順。設定にない事業名のタスクは最後に）
  const groups = useMemo(() => {
    const names = cfg.categories.map((c) => c.name);
    const extra = [...new Set(tasks.map((t) => t.category).filter((n) => !names.includes(n)))];
    return [...names, ...extra]
      .filter((name) => !cat || name === cat)
      .map((name) => {
        const all = tasks.filter((t) => t.category === name && (!who || (who === 'none' ? !t.assigneeId : t.assigneeId === who)));
        const open = all.filter((t) => t.status !== '完了');
        const done = all.filter((t) => t.status === '完了');
        const list =
          view === 'open' ? open.sort(byDue) : view === 'done' ? done.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt))) : [...open.sort(byDue), ...done];
        return { name, company: companyOf(name), open: open.length, done: done.length, overdue: open.filter((t) => overdueOn(t, t0)).length, list };
      });
  }, [tasks, cfg, cat, who, view, t0, companyOf]);

  const openCount = useCallback((name) => tasks.filter((t) => t.status !== '完了' && (!name || t.category === name)).length, [tasks]);

  const toggleDone = async (t) => {
    const next = { ...t, status: t.status === '完了' ? '進行中' : '完了' };
    setTasks((all) => all.map((x) => (x.id === t.id ? next : x)));
    try {
      const r = await api.updateTask({ id: t.id, status: next.status });
      setTasks((all) => all.map((x) => (x.id === t.id ? r.task : x)));
    } catch (e) {
      onAuthError(e);
      setError(e.message);
      load();
    }
  };

  const save = async (form) => {
    const r = form.id ? await api.updateTask(form) : await api.addTask(form);
    setTasks((all) => (form.id ? all.map((x) => (x.id === r.task.id ? r.task : x)) : [...all, r.task]));
    setEditing(null);
  };

  const remove = async (id) => {
    await api.deleteTask(id);
    setTasks((all) => all.filter((x) => x.id !== id));
    setEditing(null);
  };

  const newTask = (category) =>
    setEditing({ title: '', detail: '', category: category || cat || cfg.categories[0]?.name || '', priority: '中', status: '未着手', assigneeId: '', dueDate: '' });

  return (
    <section className="page">
      <div className="page-head">
        <h1>業務タスク</h1>
        <button type="button" className="btn gold" onClick={() => newTask()}>
          ＋ 新規タスク
        </button>
      </div>

      <div className="chips" role="group" aria-label="事業で絞り込む">
        <button type="button" className={`chip${cat === '' ? ' on' : ''}`} onClick={() => setCat('')}>
          すべて<b>{openCount('')}</b>
        </button>
        {cfg.categories.map((c) => (
          <button key={c.id} type="button" className={`chip${cat === c.name ? ' on' : ''}`} onClick={() => setCat(c.name)}>
            <i className={`dot ${COMPANY_CLASS[c.company] || 'c-all'}`} />
            {c.name}
            <b className={openCount(c.name) ? '' : 'zero'}>{openCount(c.name)}</b>
          </button>
        ))}
      </div>

      <div className="task-tools">
        <div className="seg compact" role="group" aria-label="表示するタスク">
          {VIEWS.map(([k, label]) => (
            <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="担当者で絞り込む">
          <option value="">すべての担当者</option>
          <option value="none">担当者なし</option>
          {cfg.assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
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
      ) : (
        <div className="groups">
          {groups.map((g) => {
            const isFolded = folded[g.name];
            return (
              <section key={g.name} className="group">
                <button type="button" className="group-head" onClick={() => setFolded((f) => ({ ...f, [g.name]: !f[g.name] }))} aria-expanded={!isFolded}>
                  <span className={`group-bar ${COMPANY_CLASS[g.company] || 'c-all'}`} aria-hidden="true" />
                  <span className="group-name">{g.name}</span>
                  <span className="group-co">{g.company}</span>
                  <span className="group-counts">
                    <span className="gc-open">未完了 {g.open}</span>
                    {g.overdue > 0 && <span className="gc-over">期限切れ {g.overdue}</span>}
                    <span className="gc-done">完了 {g.done}</span>
                  </span>
                  <span className={`chev${isFolded ? '' : ' open'}`} aria-hidden="true" />
                </button>
                {!isFolded && (
                  <div className="group-body">
                    {g.list.length === 0 ? (
                      <p className="muted group-empty">{view === 'done' ? '完了したタスクはありません' : view === 'open' ? '未完了のタスクはありません' : 'タスクはありません'}</p>
                    ) : (
                      <ul className="task-list">
                        {g.list.map((t) => (
                          <li key={t.id} className={`task${t.status === '完了' ? ' done' : ''}${overdueOn(t, t0) ? ' overdue' : ''}`}>
                            <button type="button" className="check" aria-label={t.status === '完了' ? '未完了に戻す' : '完了にする'} onClick={() => toggleDone(t)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M6 12.5l4 4 8-9" />
                              </svg>
                            </button>
                            <button type="button" className="task-body" onClick={() => setEditing(t)}>
                              <span className="task-title">{t.title}</span>
                              {t.detail && <span className="task-detail">{t.detail}</span>}
                              {t.checklist?.length > 0 && (
                                <span className="cl-prog">
                                  <span className="cl-bar">
                                    <i style={{ width: `${(t.checklist.filter((c) => c.done).length / t.checklist.length) * 100}%` }} />
                                  </span>
                                  細目 {t.checklist.filter((c) => c.done).length}/{t.checklist.length}
                                </span>
                              )}
                              <span className="task-meta">
                                <span className={`pri p-${t.priority}`}>{t.priority}</span>
                                {t.status !== '完了' && <span className={`st st-${t.status}`}>{t.status}</span>}
                                {t.dueDate && (
                                  <span className="due">
                                    {overdueOn(t, t0) ? '期限切れ ' : '期限 '}
                                    {fmtDate(t.dueDate)}
                                  </span>
                                )}
                                <span className="who">{assigneeName(t.assigneeId) || '担当者なし'}</span>
                                {t.status === '完了' && (
                                  <span className="done-at">
                                    完了 {fmtStamp(t.completedAt)}
                                    {t.completedBy ? `（${userName(t.completedBy)}）` : ''}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" className="group-add" onClick={() => newTask(g.name)}>
                      ＋ {g.name}にタスクを追加
                    </button>
                  </div>
                )}
              </section>
            );
          })}
          {me.role === 'admin' && cfg.categories.length === 0 && <p className="muted">設定タブの「タスク設定」で事業を登録してください。</p>}
        </div>
      )}

      {editing && <TaskModal task={editing} cfg={cfg} onClose={() => setEditing(null)} onSave={save} onDelete={remove} userName={userName} />}
    </section>
  );
}

function TaskModal({ task, cfg, onClose, onSave, onDelete, userName }) {
  const [f, setF] = useState(task);
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
    if (!f.title.trim()) {
      setErr('タスク名を入力してください');
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
    if (!window.confirm(`「${f.title}」を削除します。よろしいですか？`)) return;
    setBusy(true);
    try {
      await onDelete(f.id);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  const catNames = cfg.categories.map((c) => c.name);

  return (
    <div className="modal-veil" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2>{f.id ? 'タスクの編集' : '新規タスク'}</h2>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          タスク名
          <input value={f.title} onChange={set('title')} autoFocus />
        </label>
        <label>
          内容・メモ
          <textarea rows={3} value={f.detail} onChange={set('detail')} />
        </label>
        <Checklist items={f.checklist || []} onChange={(checklist) => setF((x) => ({ ...x, checklist }))} />
        <div className="grid2">
          <label>
            事業
            <select value={f.category} onChange={set('category')}>
              {!catNames.includes(f.category) && f.category && <option value={f.category}>{f.category}</option>}
              {cfg.categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            担当者
            <select value={f.assigneeId} onChange={set('assigneeId')}>
              <option value="">担当者なし</option>
              {cfg.assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            優先度
            <select value={f.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            期限
            <input type="date" value={f.dueDate} onChange={set('dueDate')} />
          </label>
        </div>
        <div className="seg" role="group" aria-label="状況">
          {STATUSES.map((s) => (
            <button key={s} type="button" className={f.status === s ? 'on' : ''} onClick={() => setF((x) => ({ ...x, status: s }))}>
              {s}
            </button>
          ))}
        </div>
        {f.id && (
          <p className="muted small">
            登録 {fmtStamp(f.createdAt)}
            {f.createdBy ? `（${userName(f.createdBy)}）` : ''}
            {f.updatedAt && f.updatedAt !== f.createdAt ? `　更新 ${fmtStamp(f.updatedAt)}` : ''}
            {f.completedAt ? `　完了 ${fmtStamp(f.completedAt)}` : ''}
          </p>
        )}
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

const tmpId = () => `c-${Math.random().toString(36).slice(2, 9)}`;

function Checklist({ items, onChange }) {
  const [text, setText] = useState('');
  const done = items.filter((c) => c.done).length;
  const add = () => {
    const v = text.trim();
    if (!v) return;
    onChange([...items, { id: tmpId(), text: v, done: false }]);
    setText('');
  };
  return (
    <div className="cl">
      <div className="cl-head">
        <span>細目</span>
        {items.length > 0 && (
          <span className="muted small">
            {done}/{items.length} 完了
          </span>
        )}
      </div>
      <ul>
        {items.map((c) => (
          <li key={c.id} className={c.done ? 'done' : ''}>
            <button
              type="button"
              className="cl-check"
              aria-label={c.done ? '未完了に戻す' : '完了にする'}
              onClick={() => onChange(items.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 12.5l4 4 8-9" />
              </svg>
            </button>
            <input value={c.text} onChange={(e) => onChange(items.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))} aria-label="細目" />
            <button type="button" className="cl-del" aria-label="細目を削除" onClick={() => onChange(items.filter((x) => x.id !== c.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="cl-add">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="細目を追加"
        />
        <button type="button" className="btn ghost sm" onClick={add}>
          追加
        </button>
      </div>
    </div>
  );
}
