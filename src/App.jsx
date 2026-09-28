import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { ConfirmProvider } from './components/Confirm.jsx';
import Layout from './components/Layout.jsx';
import Splash from './components/Splash.jsx';
import Companies from './pages/Companies.jsx';
import Docs from './pages/Docs.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import Sites from './pages/Sites.jsx';
import Tasks from './pages/Tasks.jsx';
import Vehicles from './pages/Vehicles.jsx';

const PAGES = { tasks: '業務タスク', vehicles: '車両一覧', sites: 'HP閲覧', docs: '各種資料', companies: '会社情報', settings: '設定' };
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

  if (checking) return <Splash />;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <ConfirmProvider>
      <Layout user={user} page={page} pages={PAGES} onNavigate={go} onLogout={logout}>
        {page === 'tasks' && <Tasks me={user} onAuthError={onAuthError} />}
        {page === 'vehicles' && <Vehicles onAuthError={onAuthError} />}
        {page === 'sites' && <Sites />}
        {page === 'docs' && <Docs onAuthError={onAuthError} />}
        {page === 'companies' && <Companies me={user} onAuthError={onAuthError} />}
        {page === 'settings' && <Settings me={user} onMeChange={setUser} onAuthError={onAuthError} />}
      </Layout>
    </ConfirmProvider>
  );
}
