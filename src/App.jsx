import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import Tasks from './pages/Tasks.jsx';

const PAGES = { tasks: '業務タスク', settings: '設定' };
const pageFromHash = () => {
  const p = window.location.hash.replace('#/', '');
  return PAGES[p] ? p : 'tasks';
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState(pageFromHash());

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((p) => {
    window.location.hash = `#/${p}`;
    setPage(p);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  // セッション切れで401が返ったらログイン画面へ戻す
  const onAuthError = useCallback((e) => {
    if (e?.status === 401) setUser(null);
  }, []);

  if (checking) return <div className="boot">読み込み中…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <Layout user={user} page={page} pages={PAGES} onNavigate={go} onLogout={logout}>
      {page === 'tasks' && <Tasks me={user} onAuthError={onAuthError} />}
      {page === 'settings' && <Settings me={user} onMeChange={setUser} onAuthError={onAuthError} />}
    </Layout>
  );
}
