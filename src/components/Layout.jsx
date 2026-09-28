import { useEffect, useState } from 'react';

export function KoyoLogo({ className = '', top = 'currentColor' }) {
  return (
    <svg className={className} viewBox="0 0 560 160" role="img" aria-label="KOYO">
      <defs>
        <clipPath id="koyo-top">
          <polygon points="0,0 560,0 560,74 0,96" />
        </clipPath>
        <clipPath id="koyo-bot">
          <polygon points="0,106 560,84 560,160 0,160" />
        </clipPath>
      </defs>
      <g clipPath="url(#koyo-top)">
        <text x="280" y="132" textAnchor="middle" fontFamily="Michroma, sans-serif" fontSize="128" letterSpacing="6" fill={top}>
          KOYO
        </text>
      </g>
      <g clipPath="url(#koyo-bot)">
        <text x="280" y="132" textAnchor="middle" fontFamily="Michroma, sans-serif" fontSize="128" letterSpacing="6" fill="#C9A45C">
          KOYO
        </text>
      </g>
    </svg>
  );
}

const ICONS = {
  tasks: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" />
    </svg>
  ),
  vehicles: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 16v-4l2-5h14l2 5v4z" />
      <path d="M3 12h18" />
      <circle cx="7" cy="16.5" r="1.8" />
      <circle cx="17" cy="16.5" r="1.8" />
    </svg>
  ),
  sites: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
  ),
  docs: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
};

export default function Layout({ user, page, pages, onNavigate, onLogout, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  const nav = (
    <>
      <div className="brand">
        <KoyoLogo className="brand-logo" top="#F2F1EC" />
        <div className="brand-sub">KOYOグループ 業務管理システム</div>
      </div>
      <nav className="menu" aria-label="メインメニュー">
        {Object.entries(pages).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`menu-item${page === k ? ' active' : ''}`}
            onClick={() => {
              onNavigate(k);
              setOpen(false);
            }}
          >
            {ICONS[k]}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="side-user">
        <div className="side-user-name">{user.name}</div>
        <div className="side-user-role">
          {user.role === 'admin' ? '管理者' : 'メンバー'}　@{user.username}
        </div>
        <button type="button" className="logout" onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </>
  );

  return (
    <div className="shell">
      <aside className="sidebar">{nav}</aside>

      <header className="topbar">
        <button type="button" className="hamburger" aria-label="メニューを開く" aria-expanded={open} onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
        <KoyoLogo className="topbar-logo" top="#F2F1EC" />
        <div className="topbar-title">{pages[page]}</div>
      </header>

      <div className={`drawer-veil${open ? ' show' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`drawer${open ? ' show' : ''}`} aria-hidden={!open}>
        <button type="button" className="drawer-close" aria-label="メニューを閉じる" onClick={() => setOpen(false)}>
          ×
        </button>
        {nav}
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
