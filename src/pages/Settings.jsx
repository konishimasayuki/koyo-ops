import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

export default function Settings({ me, onMeChange, onAuthError }) {
  const isAdmin = me.role === 'admin';
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [cfgVer, setCfgVer] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.users();
      setUsers(r.users);
    } catch (e) {
      onAuthError(e);
      setErr(e.message);
    }
  }, [onAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (m) => {
    setMsg(m);
    setErr('');
    window.setTimeout(() => setMsg(''), 3000);
  };
  const fail = (e) => {
    onAuthError(e);
    setErr(e.message);
    setMsg('');
  };

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>設定</h1>
          <p className="muted">タスクの事業・担当者と、ユーザーの管理を行います。</p>
        </div>
      </div>
      {msg && (
        <p className="form-ok" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}

      {isAdmin && <TaskSettings key={cfgVer} onFlash={flash} onError={fail} />}
      {isAdmin && (
        <ImportTasks
          onDone={(m) => {
            flash(m);
            setCfgVer((v) => v + 1);
          }}
          onError={fail}
        />
      )}

      <div className="cards">
        {isAdmin && (
          <AddUser
            onAdded={(u) => {
              setUsers((x) => [...x, u]);
              flash(`${u.name}さんを追加しました`);
            }}
            onError={fail}
          />
        )}
        <UserList users={users} me={me} isAdmin={isAdmin} onChanged={load} onFlash={flash} onError={fail} />
        <MyAccount me={me} onMeChange={onMeChange} onFlash={flash} onError={fail} />
      </div>
    </section>
  );
}

function AddUser({ onAdded, onError }) {
  const [f, setF] = useState({ username: '', name: '', password: '', role: 'member' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.addUser(f);
      onAdded(r.user);
      setF({ username: '', name: '', password: '', role: 'member' });
    } catch (e2) {
      onError(e2);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>ユーザー追加</h2>
      <div className="grid2">
        <label>
          ログインID
          <input value={f.username} onChange={set('username')} autoCapitalize="none" autoCorrect="off" placeholder="例）shimizu" />
        </label>
        <label>
          表示名
          <input value={f.name} onChange={set('name')} placeholder="例）清水" />
        </label>
        <label>
          パスワード
          <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
        </label>
        <label>
          権限
          <select value={f.role} onChange={set('role')}>
            <option value="member">メンバー</option>
            <option value="admin">管理者</option>
          </select>
        </label>
      </div>
      <p className="muted small">ログインIDは半角英数字です。管理者は、ユーザーの追加・削除とタスク設定の変更ができます。</p>
      <div className="card-foot">
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? '追加中…' : '追加する'}
        </button>
      </div>
    </form>
  );
}

function UserList({ users, me, isAdmin, onChanged, onFlash, onError }) {
  const confirm = useConfirm();
  const del = async (u) => {
    if (!(await confirm(`${u.name}さん（@${u.username}）を削除します。よろしいですか？`, { ok: '削除する', danger: true }))) return;
    try {
      await api.deleteUser(u.id);
      onFlash(`${u.name}さんを削除しました`);
      onChanged();
    } catch (e) {
      onError(e);
    }
  };
  const toggleRole = async (u) => {
    try {
      await api.updateUser({ id: u.id, role: u.role === 'admin' ? 'member' : 'admin' });
      onFlash(`${u.name}さんの権限を変更しました`);
      onChanged();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="card">
      <h2>ユーザー一覧（{users.length}名）</h2>
      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id}>
            <div className="avatar" aria-hidden="true">
              {(u.name || u.username).slice(0, 1)}
            </div>
            <div className="u-main">
              <b>
                {u.name}
                {u.id === me.id && <em className="me">あなた</em>}
              </b>
              <span>@{u.username}</span>
            </div>
            <span className={`role ${u.role}`}>{u.role === 'admin' ? '管理者' : 'メンバー'}</span>
            {isAdmin && u.id !== me.id && (
              <div className="u-actions">
                <button type="button" className="btn ghost sm" onClick={() => toggleRole(u)}>
                  {u.role === 'admin' ? 'メンバーにする' : '管理者にする'}
                </button>
                <button type="button" className="btn danger-ghost sm" onClick={() => del(u)}>
                  削除
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyAccount({ me, onMeChange, onFlash, onError }) {
  const [name, setName] = useState(me.name);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw && pw !== pw2) {
      onError(new Error('確認用のパスワードが一致しません'));
      return;
    }
    setBusy(true);
    try {
      const r = await api.updateUser({ id: me.id, name, ...(pw ? { password: pw } : {}) });
      onMeChange(r.user);
      setPw('');
      setPw2('');
      onFlash(pw ? '表示名とパスワードを更新しました' : '表示名を更新しました');
    } catch (e2) {
      onError(e2);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>自分のアカウント</h2>
      <div className="grid2">
        <label>
          表示名
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          ログインID
          <input value={me.username} disabled />
        </label>
        <label>
          新しいパスワード
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="変更する場合のみ" />
        </label>
        <label>
          新しいパスワード（確認）
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      {me.username === 'z' && <p className="muted small">初期アカウント（z / z）のままです。本番で使う前に、パスワードを変えてください。</p>}
      <div className="card-foot">
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}

const COMPANIES = ['浩洋国際', 'HayateX', 'GTO', '3社共同'];
const tmpId = () => `new-${Math.random().toString(36).slice(2, 9)}`;

function TaskSettings({ onFlash, onError }) {
  const [cats, setCats] = useState([]);
  const [people, setPeople] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .taskConfig()
      .then((r) => {
        setCats(r.config.categories);
        setPeople(r.config.assignees);
      })
      .catch(onError);
  }, [onError]);

  const touch =
    (fn) =>
    (...a) => {
      fn(...a);
      setDirty(true);
    };
  const editCat = touch((id, k, v) => setCats((l) => l.map((c) => (c.id === id ? { ...c, [k]: v } : c))));
  const moveCat = touch((i, d) =>
    setCats((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    }),
  );
  const delCat = touch((id) => setCats((l) => l.filter((c) => c.id !== id)));
  const addCat = touch(() => {
    const name = newCat.trim();
    if (!name) return;
    setCats((l) => [...l, { id: tmpId(), name, company: '3社共同' }]);
    setNewCat('');
  });
  const editPerson = touch((id, v) => setPeople((l) => l.map((p) => (p.id === id ? { ...p, name: v } : p))));
  const delPerson = touch((id) => setPeople((l) => l.filter((p) => p.id !== id)));
  const addPerson = touch(() => {
    const name = newPerson.trim();
    if (!name) return;
    setPeople((l) => [...l, { id: tmpId(), name }]);
    setNewPerson('');
  });

  const save = async () => {
    setBusy(true);
    try {
      const strip = (x) => ({ ...x, id: String(x.id).startsWith('new-') ? '' : x.id });
      const r = await api.saveTaskConfig({ categories: cats.map(strip), assignees: people.map(strip) });
      setCats(r.config.categories);
      setPeople(r.config.assignees);
      setDirty(false);
      onFlash('タスク設定を保存しました');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (fn) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div className="card task-settings">
      <div className="ts-head">
        <h2>タスク設定</h2>
        <button type="button" className="btn gold" onClick={save} disabled={busy || !dirty}>
          {busy ? '保存中…' : dirty ? '変更を保存' : '保存済み'}
        </button>
      </div>
      <div className="ts-cols">
        <div>
          <h3>事業</h3>
          <p className="muted small">業務タスクは、この並び順で事業ごとに表示されます。会社の色が付きます。</p>
          <ul className="ts-list">
            {cats.map((c, i) => (
              <li key={c.id}>
                <input value={c.name} onChange={(e) => editCat(c.id, 'name', e.target.value)} aria-label="事業名" />
                <select value={c.company} onChange={(e) => editCat(c.id, 'company', e.target.value)} aria-label="会社">
                  {COMPANIES.map((co) => (
                    <option key={co}>{co}</option>
                  ))}
                </select>
                <div className="ts-btns">
                  <button type="button" className="icon" onClick={() => moveCat(i, -1)} disabled={i === 0} aria-label="上へ">
                    ↑
                  </button>
                  <button type="button" className="icon" onClick={() => moveCat(i, 1)} disabled={i === cats.length - 1} aria-label="下へ">
                    ↓
                  </button>
                  <button type="button" className="icon del" onClick={() => delCat(c.id)} aria-label="削除">
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="ts-add">
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={onEnter(addCat)} placeholder="事業を追加（例：建設）" />
            <button type="button" className="btn ghost" onClick={addCat}>
              追加
            </button>
          </div>
        </div>
        <div>
          <h3>担当者</h3>
          <p className="muted small">タスクの担当者欄に出る名前です。ログインしない人も登録できます。</p>
          <ul className="ts-list">
            {people.map((p) => (
              <li key={p.id} className="one">
                <input value={p.name} onChange={(e) => editPerson(p.id, e.target.value)} aria-label="担当者名" />
                <div className="ts-btns">
                  <button type="button" className="icon del" onClick={() => delPerson(p.id)} aria-label="削除">
                    ×
                  </button>
                </div>
              </li>
            ))}
            {people.length === 0 && <li className="muted small">まだ登録されていません</li>}
          </ul>
          <div className="ts-add">
            <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} onKeyDown={onEnter(addPerson)} placeholder="担当者を追加（例：清水）" />
            <button type="button" className="btn ghost" onClick={addPerson}>
              追加
            </button>
          </div>
        </div>
      </div>
      {dirty && <p className="muted small">変更は「変更を保存」を押すまで反映されません。</p>}
    </div>
  );
}

function ImportTasks({ onDone, onError }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (
      !(await confirm(
        '戦略資料の開業準備タスク（細目つき）を取り込みます。\n・事業を8つ（共通／レンタカー／スパイダー／タクシー／アドトラック／キャンプトレーラー／トレーラー販売／整備工場）に整理します\n・登録済みのタスクは残し、細目を追加します\n・足りないタスクを追加します\nよろしいですか？',
        { ok: '取り込む' },
      ))
    )
      return;
    setBusy(true);
    try {
      const r = await api.importTasks();
      onDone(`タスクを${r.created}件追加し、${r.updated}件を更新しました`);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card import-card">
      <div>
        <h2>資料のタスクを取り込む</h2>
        <p className="muted small">戦略資料の開業準備タスクを、細目（チェック項目）つきで取り込みます。登録済みのタスクや完了状況は消えません。何度押しても重複しません。</p>
      </div>
      <button type="button" className="btn ghost" onClick={run} disabled={busy}>
        {busy ? '取り込み中…' : '取り込む'}
      </button>
    </div>
  );
}
