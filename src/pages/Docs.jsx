import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

import { openPdf, pdfThumb, renderPage } from '../pdf.js';

const COMPANIES = ['浩洋国際', 'HayateX', 'GTO', '3社共同'];
const COMPANY_CLASS = { 浩洋国際: 'c-koyo', HayateX: 'c-hx', GTO: 'c-gto', '3社共同': 'c-all' };
const CHUNK = 700_000;
const MAX_BYTES = 20 * 1024 * 1024;
const blobCache = new Map();

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const fmtDay = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};
const isPdf = (d) => d.mime === 'application/pdf';

function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('ファイルを読み込めませんでした'));
    fr.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

function drawTo(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

// 写真は長辺2400pxのJPEGに縮小し、一覧用のサムネイルも作る
async function prepareFile(file) {
  if (file.type === 'application/pdf') return { blob: file, mime: 'application/pdf', thumb: await pdfThumb(file) };
  try {
    const { img, url } = await loadImage(file);
    const big = await drawTo(img, 2400, 0.85);
    const small = await drawTo(img, 360, 0.7);
    URL.revokeObjectURL(url);
    const useBig = big && (big.size < file.size || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    return { blob: useBig ? big : file, mime: useBig ? 'image/jpeg' : file.type, thumb: small ? await readAsDataURL(small) : '' };
  } catch {
    return { blob: file, mime: file.type || 'image/jpeg', thumb: '' };
  }
}

async function fetchBlob(doc, onProgress) {
  if (blobCache.has(doc.id)) return blobCache.get(doc.id);
  let b64 = '';
  for (let i = 0; i < doc.chunks; i++) {
    const r = await api.docChunk(doc.id, i);
    b64 += r.data;
    onProgress?.((i + 1) / doc.chunks);
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const entry = { url: URL.createObjectURL(new Blob([bytes], { type: doc.mime })), bytes };
  blobCache.set(doc.id, entry);
  return entry;
}

export default function Docs({ onAuthError }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [co, setCo] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.docs();
      setDocs(r.docs);
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

  const counts = useMemo(() => Object.fromEntries(COMPANIES.map((c) => [c, docs.filter((d) => d.company === c).length])), [docs]);
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return docs
      .filter((d) => !co || d.company === co)
      .filter((d) => !kw || `${d.name} ${d.fileName} ${d.note || ''}`.toLowerCase().includes(kw))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [docs, co, q]);

  return (
    <section className="page">
      <div className="page-head">
        <h1>各種資料</h1>
        <button type="button" className="btn gold" onClick={() => setAdding(true)}>
          ＋ 資料を登録
        </button>
      </div>

      <div className="chips" role="group" aria-label="会社で絞り込む">
        <button type="button" className={`chip${co === '' ? ' on' : ''}`} onClick={() => setCo('')}>
          すべて<b>{docs.length}</b>
        </button>
        {COMPANIES.map((c) => (
          <button key={c} type="button" className={`chip${co === c ? ' on' : ''}`} onClick={() => setCo(c)}>
            <i className={`dot ${COMPANY_CLASS[c]}`} />
            {c}
            <b>{counts[c] || 0}</b>
          </button>
        ))}
      </div>
      <input className="search docs-search" placeholder="名称・ファイル名で検索" value={q} onChange={(e) => setQ(e.target.value)} />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted pad">読み込み中…</p>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>資料はまだありません。</p>
          <p className="muted">「＋ 資料を登録」から、写真やPDFを登録できます。</p>
        </div>
      ) : (
        <ul className="doc-grid">
          {shown.map((d) => (
            <li key={d.id}>
              <button type="button" className="doc" onClick={() => setViewing(d)}>
                <span className="doc-thumb">
                  {d.thumb ? <img src={d.thumb} alt="" /> : <span className={`doc-icon${isPdf(d) ? ' pdf' : ''}`}>{isPdf(d) ? 'PDF' : 'IMG'}</span>}
                </span>
                <span className="doc-info">
                  <b>{d.name}</b>
                  <span className="doc-meta">
                    <span className={`tag ${COMPANY_CLASS[d.company] || 'c-all'}`}>{d.company}</span>
                    <span>
                      {isPdf(d) ? 'PDF' : '写真'}・{fmtSize(d.size)}・{fmtDay(d.createdAt)}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <UploadModal
          onClose={() => setAdding(false)}
          onDone={(d) => {
            setDocs((l) => [d, ...l]);
            setAdding(false);
          }}
        />
      )}
      {viewing && (
        <ViewModal
          doc={viewing}
          onClose={() => setViewing(null)}
          onSaved={(d) => {
            setDocs((l) => l.map((x) => (x.id === d.id ? d : x)));
            setViewing(d);
          }}
          onDeleted={(id) => {
            setDocs((l) => l.filter((x) => x.id !== id));
            setViewing(null);
          }}
        />
      )}
    </section>
  );
}

function UploadModal({ onClose, onDone }) {
  const [company, setCompany] = useState('浩洋国際');
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) {
      setErr('写真かPDFを選んでください');
      return;
    }
    setErr('');
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setErr('名称を入力してください');
    if (!file) return setErr('ファイルを選んでください');
    setBusy(true);
    setErr('');
    try {
      const prep = await prepareFile(file);
      if (prep.blob.size > MAX_BYTES) throw new Error('ファイルは20MBまでです');
      const b64 = (await readAsDataURL(prep.blob)).split(',')[1];
      const parts = [];
      for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
      const meta = await api.addDoc({ company, name: name.trim(), fileName: file.name, mime: prep.mime, size: prep.blob.size, chunks: parts.length, thumb: prep.thumb });
      for (let i = 0; i < parts.length; i++) {
        await api.putDocChunk(meta.doc.id, i, parts[i]);
        setProgress((i + 1) / parts.length);
      }
      const r = await api.finishDoc(meta.doc.id);
      onDone(r.doc);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-veil" onClick={busy ? undefined : onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2>資料を登録</h2>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="grid2">
          <label>
            会社名
            <select value={company} onChange={(e) => setCompany(e.target.value)}>
              {COMPANIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            名称
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例）自家用自動車有償貸渡許可証" />
          </label>
        </div>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={pick} hidden />
        <button type="button" className="drop" onClick={() => inputRef.current?.click()} disabled={busy}>
          {preview ? <img src={preview} alt="" /> : file ? <span className="doc-icon pdf">PDF</span> : <span className="drop-plus">＋</span>}
          <span>{file ? `${file.name}（${fmtSize(file.size)}）` : '写真・PDFを選ぶ'}</span>
          <small className="muted">写真は自動で縮小します。20MBまで</small>
        </button>
        {busy && (
          <div className="bar" aria-label="アップロード中">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
        <div className="modal-foot">
          <span />
          <div className="row-gap">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              キャンセル
            </button>
            <button type="submit" className="btn gold" disabled={busy}>
              {busy ? `アップロード中 ${Math.round(progress * 100)}%` : '登録する'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ViewModal({ doc, onClose, onSaved, onDeleted }) {
  const confirm = useConfirm();
  const [file, setFile] = useState(blobCache.get(doc.id) || null);
  const url = file?.url || '';
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(doc.name);
  const [company, setCompany] = useState(doc.company);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchBlob(doc, (p) => alive && setProgress(p))
      .then((f) => alive && setFile(f))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [doc]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.updateDoc({ id: doc.id, name, company });
      onSaved(r.doc);
      setEdit(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!(await confirm(`「${doc.name}」を削除します。よろしいですか？`, { ok: '削除する', danger: true }))) return;
    setBusy(true);
    try {
      await api.deleteDoc(doc.id);
      onDeleted(doc.id);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="viewer-title">
            <span className={`tag ${COMPANY_CLASS[doc.company] || 'c-all'}`}>{doc.company}</span>
            <h2>{doc.name}</h2>
          </div>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="viewer-body">
          {!url && !err && (
            <div className="viewer-loading">
              <p className="muted">読み込み中… {Math.round(progress * 100)}%</p>
              <div className="bar">
                <i style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
          {file && (isPdf(doc) ? <PdfPages bytes={file.bytes} /> : <img src={url} alt={doc.name} className="viewer-img" />)}
        </div>

        {edit && (
          <div className="grid2">
            <label>
              会社名
              <select value={company} onChange={(e) => setCompany(e.target.value)}>
                {COMPANIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              名称
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
        )}
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
        <p className="muted small">
          {doc.fileName}・{fmtSize(doc.size)}・登録 {fmtDay(doc.createdAt)}
        </p>
        <div className="modal-foot">
          <button type="button" className="btn danger-ghost" onClick={del} disabled={busy}>
            削除
          </button>
          <div className="row-gap wrap">
            {url && (
              <a className="btn ghost" href={url} target="_blank" rel="noreferrer" download={isPdf(doc) ? undefined : doc.fileName}>
                {isPdf(doc) ? '別タブで開く' : '保存'}
              </a>
            )}
            {edit ? (
              <button type="button" className="btn gold" onClick={save} disabled={busy}>
                保存
              </button>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setEdit(true)}>
                編集
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfPages({ bytes }) {
  const box = useRef(null);
  const [info, setInfo] = useState('PDFを表示しています…');

  useEffect(() => {
    let alive = true;
    const el = box.current;
    (async () => {
      try {
        const doc = await openPdf(bytes.slice());
        const width = Math.min(el.clientWidth - 16, 900);
        const pages = Math.min(doc.numPages, 50);
        for (let n = 1; n <= pages; n++) {
          if (!alive) return;
          const canvas = await renderPage(doc, n, width);
          canvas.className = 'pdf-page';
          el.appendChild(canvas);
          setInfo(`${n} / ${doc.numPages}ページ`);
        }
        if (doc.numPages > pages) setInfo(`${pages} / ${doc.numPages}ページ（残りは「別タブで開く」で確認できます）`);
      } catch {
        setInfo('このPDFはここでは表示できません。「別タブで開く」で確認してください');
      }
    })();
    return () => {
      alive = false;
      el.replaceChildren();
    };
  }, [bytes]);

  return (
    <div className="pdf-wrap">
      <div ref={box} className="pdf-pages" />
      <p className="muted small pdf-info">{info}</p>
    </div>
  );
}
