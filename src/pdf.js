// PDFの表示とサムネイル作成（pdf.jsは使うときだけ読み込む）
let lib = null;
async function pdfjs() {
  if (lib) return lib;
  const [mod, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  mod.GlobalWorkerOptions.workerSrc = worker.default;
  lib = mod;
  return lib;
}

export async function openPdf(data) {
  const { getDocument } = await pdfjs();
  return getDocument({ data }).promise;
}

export async function renderPage(doc, n, width) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: (width / base.width) * ratio });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / ratio)}px`;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas;
}

// 1ページ目から一覧用のサムネイル（JPEG）を作る
export async function pdfThumb(file) {
  try {
    const doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
    const canvas = await renderPage(doc, 1, 360);
    const small = document.createElement('canvas');
    const s = 360 / canvas.width;
    small.width = 360;
    small.height = Math.round(canvas.height * s);
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.7);
  } catch {
    return '';
  }
}
