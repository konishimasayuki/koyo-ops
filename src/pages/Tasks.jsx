import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const CATEGORIES = ['共通', 'レンタカー', 'スパイダー', 'タクシー', 'アドトラック', 'キャンプトレーラー', '整備', 'トレーラー販売', 'HP・システム'];
const STATUSES = ['未着手', '進行中', '完了'];
const PRIORITIES = ['高', '中', '低'];
const PRI_ORDER = { 高: 0, 中: 1, 低: 2 };
const COMPANY_CLASS = { 浩洋国際: 'c-koyo', HayateX: 'c-hx', GTO: 'c-gto', '3社共同': 'c-all' };
const EMPTY = { title: '', detail: '', category: '共通', priority: '中', status: '未着手', assigneeId: '', dueDate: '' };

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

export default function Tasks({ me, onAuthError }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('open');
  const [cat, setCat] = useState('');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [t, u] = await Promise.all([api.tasks(), api.users()]);
      setTasks(t.tasks);
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

  const userName = useCallback((id) => users.find((u) => u.id === id)?.name || '', [users]);
  const t0 = today();
  const isOverdue = (t) => overdueOn(t, t0);

  const counts = useMemo(
    () => ({
      todo: tasks.filter((t) => t.status === '未着手').length,
      doing: tasks.filter((t) => t.status === '進行中').length,
      done: tasks.filter((t) => t.status === '完了').length,
      overdue: tasks.filter((t) => overdueOn(t, t0)).length,
    }),
    [tasks, t0],
  );

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return tasks
      .filter((t) => (view === 'open' ? t.status !== '完了' : view === 'done' ? t.status === '完了' : view === 'overdue' ? overdueOn(t, t0) : true))
      .filter((t) => !cat || t.category === cat)
      .filter((t) => !who || (who === 'none' ? !t.assigneeId : t.assigneeId === who))
      .filter((t) => !kw || `${t.title} ${t.detail}`.toLowerCase().includes(kw))
      .sort((a, b) => {
        if (view === 'done') return String(b.completedAt).localeCompare(String(a.completedAt));
        const da = a.dueDate || '9999';
        const db = b.dueDate || '9999';
        return da.localeCompare(db) || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || String(a.createdAt).localeCompare(String(b.createdAt));
      });
  }, [tasks, view, cat, who, q, t0]);

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

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>業務タスク</h1>
          <p className="muted">登録・編集・完了の状況を3社で共有します。</p>
        </div>
        <button type="button" className="btn gold" onClick={() => setEditing({ ...EMPTY, assigneeId: me.id })}>
          ＋ 新規タスク
        </button>
      </div>

      <div className="stats">
        <button type="button" className={`stat${view === 'open' ? ' on' : ''}`} onClick={() => setView('open')}>
          <b>{counts.todo + counts.doing}</b>
          <span>未完了</span>
          <small>
            未着手 {counts.todo}・進行中 {counts.doing}
          </small>
        </button>
        <button type="button" className={`stat warn${view === 'overdue' ? ' on' : ''}`} onClick={() => setView('overdue')}>
          <b>{counts.overdue}</b>
          <span>期限切れ</span>
          <small>期限を過ぎた未完了</small>
        </button>
        <button type="button" className={`stat ok${view === 'done' ? ' on' : ''}`} onClick={() => setView('done')}>
          <b>{counts.done}</b>
          <span>完了</span>
          <small>全{tasks.length}件中</small>
        </button>
        <button type="button" className={`stat${view === 'all' ? ' on' : ''}`} onClick={() => setView('all')}>
          <b>{tasks.length}</b>
          <span>すべて</span>
          <small>登録済みのタスク</small>
        </button>
      </div>

      <div className="filters">
        <input className="search" placeholder="タスク名・内容で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="事業で絞り込む">
          <option value="">すべての事業</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="担当者で絞り込む">
          <option value="">すべての担当者</option>
          <option value={me.id}>自分</option>
          <option value="none">担当者なし</option>
          {users
            .filter((u) => u.id !== me.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
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
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>表示するタスクはありません。</p>
          {tasks.length === 0 && me.role === 'admin' && <p className="muted">設定タブの「初期タスクの取り込み」で、開業準備タスクをまとめて登録できます。</p>}
        </div>
      ) : (
        <ul className="task-list">
          {shown.map((t) => (
            <li key={t.id} className={`task${t.status === '完了' ? ' done' : ''}${isOverdue(t) ? ' overdue' : ''}`}>
              <button type="button" className="check" aria-label={t.status === '完了' ? '未完了に戻す' : '完了にする'} onClick={() => toggleDone(t)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 12.5l4 4 8-9" />
                </svg>
              </button>
              <button type="button" className="task-body" onClick={() => setEditing(t)}>
                <span className="task-title">{t.title}</span>
                {t.detail && <span className="task-detail">{t.detail}</span>}
                <span className="task-meta">
                  <span className={`tag ${COMPANY_CLASS[t.company] || 'c-all'}`}>{t.category}</span>
                  <span className={`pri p-${t.priority}`}>{t.priority}</span>
                  {t.status !== '完了' && <span className={`st st-${t.status}`}>{t.status}</span>}
                  {t.dueDate && (
                    <span className="due">
                      {isOverdue(t) ? '期限切れ ' : '期限 '}
                      {fmtDate(t.dueDate)}
                    </span>
                  )}
                  <span className="who">{userName(t.assigneeId) || '担当者なし'}</span>
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

      {editing && <TaskModal task={editing} users={users} onClose={() => setEditing(null)} onSave={save} onDelete={remove} userName={userName} />}
    </section>
  );
}

function TaskModal({ task, users, onClose, onSave, onDelete, userName }) {
  const [f, setF] = useState(task);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

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
          <input
            value={f.title}
            onChange={(e) => {
              set('title')(e);
              setErr('');
            }}
            autoFocus
          />
        </label>
        <label>
          内容・メモ
          <textarea rows={4} value={f.detail} onChange={set('detail')} />
        </label>
        <div className="grid2">
          <label>
            事業
            <select value={f.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            担当者
            <select value={f.assigneeId} onChange={set('assigneeId')}>
              <option value="">担当者なし</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
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
