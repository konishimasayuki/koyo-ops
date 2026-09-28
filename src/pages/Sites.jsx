import { useEffect, useState } from 'react';
import { SITES, sitePath } from '../sites.js';

const COMPANY_CLASS = { 浩洋国際: 'c-koyo', HayateX: 'c-hx', GTO: 'c-gto' };
const COMPANY_FULL = { 浩洋国際: '浩洋国際株式会社', HayateX: 'HayateX株式会社', GTO: 'GTO株式会社' };

// 準備中のページには <meta name="koyo-hp" content="draft"> が入っている
async function checkStatus(slug) {
  try {
    const res = await fetch(sitePath(slug), { cache: 'no-store' });
    if (!res.ok) return 'none';
    const html = await res.text();
    return html.includes('name="koyo-hp" content="draft"') ? 'draft' : 'live';
  } catch {
    return 'none';
  }
}

export default function Sites() {
  const [status, setStatus] = useState({});
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let alive = true;
    for (const g of SITES) {
      for (const s of g.items) {
        checkStatus(s.slug).then((st) => alive && setStatus((m) => ({ ...m, [s.slug]: st })));
      }
    }
    return () => {
      alive = false;
    };
  }, []);

  const copy = async (slug) => {
    const url = `${window.location.origin}${sitePath(slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      window.prompt('このURLをコピーしてください', url);
    }
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>HP閲覧</h1>
      </div>
      <div className="site-groups">
        {SITES.map((g) => (
          <section key={g.company} className="site-group">
            <h2 className="site-co">
              <span className={`group-bar ${COMPANY_CLASS[g.company]}`} aria-hidden="true" />
              {COMPANY_FULL[g.company]}
              <small>{g.items.length}サイト</small>
            </h2>
            <ul className="site-list">
              {g.items.map((s) => {
                const st = status[s.slug];
                return (
                  <li key={s.slug} className="site">
                    <div className="site-main">
                      <b>{s.name}</b>
                      <span className="muted small">{s.note}</span>
                    </div>
                    <span className={`site-st st-${st || 'wait'}`}>{st === 'live' ? '公開中' : st === 'draft' ? '準備中' : st === 'none' ? '未設置' : '確認中'}</span>
                    <div className="site-actions">
                      <button type="button" className="btn ghost sm" onClick={() => copy(s.slug)}>
                        {copied === s.slug ? 'コピーしました' : 'リンクをコピー'}
                      </button>
                      <a className="btn gold sm" href={sitePath(s.slug)} target="_blank" rel="noopener noreferrer">
                        開く
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
