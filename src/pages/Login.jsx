import { useState } from 'react';
import { api } from '../api.js';
import { KoyoLogo } from '../components/Layout.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('IDとパスワードを入力してください');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api.login(username, password);
      onLogin(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <KoyoLogo className="login-logo" top="#F2F1EC" />
        <h1>
          KOYOグループ
          <br />
          業務管理システム
        </h1>
        <form onSubmit={submit} noValidate>
          <label>
            ログインID
            <input
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
              }}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="text"
            />
          </label>
          <label>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn gold block" disabled={busy}>
            {busy ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
        <p className="login-foot">浩洋国際株式会社・HayateX株式会社・GTO株式会社</p>
      </div>
    </div>
  );
}
