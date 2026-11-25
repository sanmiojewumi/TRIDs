import type { PageShot } from './stamp';

/** Draws each PDF page to a JPEG the editor can stamp. Runs in the browser. The phone app renders PDFs itself. */
export async function renderPdf(data: ArrayBuffer, maxWidth = 1400): Promise<PageShot[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.toString();
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const pages: PageShot[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw that PDF.');
    const task = page.render({ canvasContext: ctx, viewport });
    await task.promise;
    pages.push({ src: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height });
  }
  return pages;
}
