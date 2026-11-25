import { renderPdf } from './pdf-render';
import { chooseFolder, folderLabel, phone, saveBlob } from './save';
import {
  clamp,
  heightFraction,
  keepInside,
  knockoutNearWhite,
  stampedName,
  pdfFromJpegs,
  type PageShot,
  type Stamp,
  type ThumbPrint,
} from './stamp';

const STORE = 'thumb-desk-prints';
const home = document.querySelector<HTMLElement>('#home')!;
const editor = document.querySelector<HTMLElement>('#editor')!;
const folderEl = document.querySelector<HTMLElement>('#folder')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const thumbsEl = document.querySelector<HTMLElement>('#thumbs')!;
const stripEl = document.querySelector<HTMLElement>('#thumb-strip')!;
const pageImg = document.querySelector<HTMLImageElement>('#page-img')!;
const overlay = document.querySelector<HTMLElement>('#overlay')!;
const docNameEl = document.querySelector<HTMLElement>('#doc-name')!;
const pageLabel = document.querySelector<HTMLElement>('#page-label')!;
const hint = document.querySelector<HTMLElement>('#hint')!;
const sizeInput = document.querySelector<HTMLInputElement>('#size')!;
const turnInput = document.querySelector<HTMLInputElement>('#turn')!;
const nameInput = document.querySelector<HTMLInputElement>('#thumb-name')!;
const liftInput = document.querySelector<HTMLInputElement>('#lift')!;

let prints: ThumbPrint[] = loadPrints();
let selectedThumbId = prints[0]?.id ?? '';
let pages: PageShot[] = [];
let pageIndex = 0;
let stamps: Stamp[] = [];
let selectedStampId = '';
let docName = '';
let docKind: 'image' | 'pdf' = 'image';
let busy = false;

interface NativeDoc {
  name: string;
  kind: 'image' | 'pdf';
  pages: PageShot[];
}

const desk = {
  loadNative(payload: NativeDoc | null) {
    if (!payload) return;
    void openPrepared(payload.name, payload.kind, payload.pages);
  },
  fail(message: string) {
    setStatus(message || 'Could not open that file.', true);
  },
  resumed() {
    void refreshFolder();
  },
};

(window as Window & { thumbDesk?: typeof desk }).thumbDesk = desk;

document.querySelector('#open')!.addEventListener('click', () => {
  if (phone()) {
    phone()!.pickDocument();
    return;
  }
  document.querySelector<HTMLInputElement>('#open-file')!.click();
});

document.querySelector('#open-file')!.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  if (file) void openFile(file);
});

document.querySelector('#add-photo')!.addEventListener('click', () => {
  document.querySelector<HTMLInputElement>('#thumb-file')!.click();
});
document.querySelector('#add-camera')!.addEventListener('click', () => {
  document.querySelector<HTMLInputElement>('#thumb-camera')!.click();
});
document.querySelector('#thumb-file')!.addEventListener('change', onThumbFile);
document.querySelector('#thumb-camera')!.addEventListener('change', onThumbFile);

document.querySelector('#change-folder')!.addEventListener('click', () => {
  void chooseFolder().then(() => refreshFolder()).catch((err: unknown) => setStatus(messageOf(err), true));
});

document.querySelector('#back')!.addEventListener('click', () => {
  editor.hidden = true;
  home.hidden = false;
  setStatus('');
});

document.querySelector('#prev')!.addEventListener('click', () => showPage(pageIndex - 1));
document.querySelector('#next')!.addEventListener('click', () => showPage(pageIndex + 1));
document.querySelector('#save')!.addEventListener('click', () => void saveDocument());
document.querySelector('#remove-stamp')!.addEventListener('click', () => {
  stamps = stamps.filter((stamp) => stamp.id !== selectedStampId);
  selectedStampId = '';
  paintStamps();
  syncControls();
});

sizeInput.addEventListener('input', () => {
  const stamp = currentStamp();
  const page = pages[pageIndex];
  const thumb = prints.find((item) => item.id === stamp?.thumbId);
  if (!stamp || !page || !thumb) return;
  stamp.w = Number(sizeInput.value) / 100;
  stamp.h = heightFraction(stamp.w, page.width, page.height, thumb.width, thumb.height);
  const next = keepInside(stamp.cx, stamp.cy, stamp.w, stamp.h);
  stamp.cx = next.cx;
  stamp.cy = next.cy;
  paintStamps();
});

turnInput.addEventListener('input', () => {
  const stamp = currentStamp();
  if (!stamp) return;
  stamp.rotation = Number(turnInput.value);
  paintStamps();
});

overlay.addEventListener('pointerdown', (event) => {
  if (event.target !== overlay) return;
  const thumb = prints.find((item) => item.id === selectedThumbId);
  const page = pages[pageIndex];
  if (!thumb || !page) {
    setStatus('Add a thumbprint first, then tap the page.', true);
    return;
  }
  const rect = overlay.getBoundingClientRect();
  const w = 0.22;
  const stamp: Stamp = {
    id: crypto.randomUUID(),
    thumbId: thumb.id,
    page: pageIndex,
    w,
    h: heightFraction(w, page.width, page.height, thumb.width, thumb.height),
    rotation: 0,
    ...keepInside(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      w,
      heightFraction(w, page.width, page.height, thumb.width, thumb.height),
    ),
  };
  stamps.push(stamp);
  selectedStampId = stamp.id;
  paintStamps();
  syncControls();
  setStatus('Drag the print to move it. Save when the page looks right.');
});

window.addEventListener('trids-resume', () => void refreshFolder());
void refreshFolder();
renderLibrary();

function onThumbFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void addThumb(file);
}

async function addThumb(file: File) {
  try {
    const prepared = await prepareThumb(file, liftInput.checked);
    const name = nameInput.value.trim() || `Thumb ${prints.length + 1}`;
    const print: ThumbPrint = { id: crypto.randomUUID(), name, ...prepared };
    prints = [...prints, print].slice(-12);
    selectedThumbId = print.id;
    savePrints();
    nameInput.value = '';
    renderLibrary();
    setStatus(`${name} is ready to place.`);
  } catch (err) {
    setStatus(messageOf(err), true);
  }
}

async function prepareThumb(file: File, lift: boolean): Promise<Pick<ThumbPrint, 'src' | 'width' | 'height'>> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that picture.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  if (lift) {
    const image = ctx.getImageData(0, 0, width, height);
    knockoutNearWhite(image.data);
    ctx.putImageData(image, 0, 0);
  }
  return { src: canvas.toDataURL('image/png'), width, height };
}

async function openFile(file: File) {
  setStatus('Opening…');
  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pagesFromPdf = await renderPdf(await file.arrayBuffer());
      if (pagesFromPdf.length === 0) throw new Error('That PDF has no pages.');
      await openPrepared(file.name, 'pdf', pagesFromPdf);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = await loadImage(url);
    await openPrepared(file.name, 'image', [{ src: url, width: image.naturalWidth, height: image.naturalHeight }]);
  } catch (err) {
    setStatus(messageOf(err), true);
  }
}

async function openPrepared(name: string, kind: 'image' | 'pdf', shots: PageShot[]) {
  docName = name;
  docKind = kind;
  pages = shots;
  pageIndex = 0;
  stamps = [];
  selectedStampId = '';
  home.hidden = true;
  editor.hidden = false;
  docNameEl.textContent = name;
  showPage(0);
  setStatus(prints.length ? 'Tap the page to place the selected thumbprint.' : 'Add a thumbprint, then tap the page.');
}

function showPage(index: number) {
  if (!pages.length) return;
  pageIndex = clamp(index, 0, pages.length - 1);
  const page = pages[pageIndex];
  pageImg.src = page.src;
  pageLabel.textContent = `Page ${pageIndex + 1} of ${pages.length}`;
  (document.querySelector('#prev') as HTMLButtonElement).disabled = pageIndex === 0;
  (document.querySelector('#next') as HTMLButtonElement).disabled = pageIndex === pages.length - 1;
  selectedStampId = stamps.find((stamp) => stamp.page === pageIndex)?.id ?? '';
  paintStamps();
  syncControls();
}

function paintStamps() {
  overlay.replaceChildren();
  for (const stamp of stamps) {
    if (stamp.page !== pageIndex) continue;
    const thumb = prints.find((item) => item.id === stamp.thumbId);
    if (!thumb) continue;
    const el = document.createElement('div');
    el.className = 'stamp' + (stamp.id === selectedStampId ? ' selected' : '');
    el.style.left = `${(stamp.cx - stamp.w / 2) * 100}%`;
    el.style.top = `${(stamp.cy - stamp.h / 2) * 100}%`;
    el.style.width = `${stamp.w * 100}%`;
    el.style.height = `${stamp.h * 100}%`;
    el.style.transform = `rotate(${stamp.rotation}deg)`;
    const img = document.createElement('img');
    img.src = thumb.src;
    img.alt = thumb.name;
    el.append(img);
    el.addEventListener('pointerdown', (event) => startDrag(event, stamp, el));
    overlay.append(el);
  }
  const count = stamps.filter((stamp) => stamp.page === pageIndex).length;
  hint.textContent = count
    ? `${count} on this page. Tap an empty part of the page to add another.`
    : 'Choose a thumbprint, then tap the page to place it.';
}

function startDrag(event: PointerEvent, stamp: Stamp, el: HTMLElement) {
  event.preventDefault();
  event.stopPropagation();
  selectedStampId = stamp.id;
  for (const node of overlay.querySelectorAll<HTMLElement>('.stamp')) node.classList.toggle('selected', node === el);
  syncControls();
  const startX = event.clientX;
  const startY = event.clientY;
  const origin = { cx: stamp.cx, cy: stamp.cy };
  const move = (ev: PointerEvent) => {
    const rect = overlay.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const next = keepInside(
      origin.cx + (ev.clientX - startX) / rect.width,
      origin.cy + (ev.clientY - startY) / rect.height,
      stamp.w,
      stamp.h,
    );
    stamp.cx = next.cx;
    stamp.cy = next.cy;
    el.style.left = `${(stamp.cx - stamp.w / 2) * 100}%`;
    el.style.top = `${(stamp.cy - stamp.h / 2) * 100}%`;
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  try {
    el.setPointerCapture(event.pointerId);
  } catch {
    /* The page still follows the finger without capture. */
  }
}

function syncControls() {
  const stamp = currentStamp();
  sizeInput.disabled = !stamp;
  turnInput.disabled = !stamp;
  (document.querySelector('#remove-stamp') as HTMLButtonElement).disabled = !stamp;
  if (!stamp) return;
  sizeInput.value = String(Math.round(stamp.w * 100));
  turnInput.value = String(Math.round(stamp.rotation));
}

function currentStamp(): Stamp | undefined {
  return stamps.find((stamp) => stamp.id === selectedStampId);
}

async function saveDocument() {
  if (busy) return;
  if (!pages.length) return;
  if (!stamps.length) {
    setStatus('Place at least one thumbprint before saving.', true);
    return;
  }
  busy = true;
  (document.querySelector('#save') as HTMLButtonElement).disabled = true;
  setStatus('Saving…');
  try {
    const rendered = await compositePages();
    if (docKind === 'image' && rendered.length === 1) {
      const name = stampedName(docName, 'jpg');
      const where = await saveBlob(new Blob([rendered[0].slice()], { type: 'image/jpeg' }), name);
      setStatus(`Saved to ${where}`);
    } else {
      const name = stampedName(docName || 'document.pdf', 'pdf');
      const pdf = pdfFromJpegs(rendered);
      const where = await saveBlob(new Blob([pdf.slice()], { type: 'application/pdf' }), name);
      setStatus(`Saved to ${where}`);
    }
  } catch (err) {
    setStatus(messageOf(err), true);
  } finally {
    busy = false;
    (document.querySelector('#save') as HTMLButtonElement).disabled = false;
  }
}

async function compositePages(): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const image = await loadImage(page.src);
    const canvas = document.createElement('canvas');
    canvas.width = page.width;
    canvas.height = page.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw the page.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, page.width, page.height);
    ctx.drawImage(image, 0, 0, page.width, page.height);
    for (const stamp of stamps) {
      if (stamp.page !== index) continue;
      const thumb = prints.find((item) => item.id === stamp.thumbId);
      if (!thumb) continue;
      const mark = await loadImage(thumb.src);
      const dw = stamp.w * page.width;
      const dh = stamp.h * page.height;
      ctx.save();
      ctx.translate(stamp.cx * page.width, stamp.cy * page.height);
      ctx.rotate((stamp.rotation * Math.PI) / 180);
      ctx.drawImage(mark, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((file) => (file ? resolve(file) : reject(new Error('Could not make the picture.'))), 'image/jpeg', 0.92);
    });
    out.push(new Uint8Array(await blob.arrayBuffer()));
  }
  return out;
}

function renderLibrary() {
  thumbsEl.replaceChildren();
  stripEl.replaceChildren();
  if (!prints.length) {
    const empty = document.createElement('p');
    empty.className = 'lead';
    empty.textContent = 'No thumbprints yet.';
    thumbsEl.append(empty);
  }
  for (const print of prints) {
    thumbsEl.append(printCard(print));
    stripEl.append(chip(print));
  }
}

function printCard(print: ThumbPrint): HTMLElement {
  const card = document.createElement('li');
  card.className = 'print-card' + (print.id === selectedThumbId ? ' selected' : '');
  const img = document.createElement('img');
  img.src = print.src;
  img.alt = '';
  const label = document.createElement('p');
  label.textContent = print.name;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'tiny';
  remove.textContent = 'Delete';
  remove.addEventListener('click', () => {
    prints = prints.filter((item) => item.id !== print.id);
    stamps = stamps.filter((stamp) => stamp.thumbId !== print.id);
    if (selectedThumbId === print.id) selectedThumbId = prints[0]?.id ?? '';
    savePrints();
    renderLibrary();
    paintStamps();
  });
  card.append(img, label, remove);
  card.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    selectedThumbId = print.id;
    renderLibrary();
  });
  return card;
}

function chip(print: ThumbPrint): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip' + (print.id === selectedThumbId ? ' selected' : '');
  const img = document.createElement('img');
  img.src = print.src;
  img.alt = '';
  const label = document.createElement('p');
  label.textContent = print.name;
  button.append(img, label);
  button.addEventListener('click', () => {
    selectedThumbId = print.id;
    renderLibrary();
  });
  return button;
}

function loadPrints(): ThumbPrint[] {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed = raw ? (JSON.parse(raw) as ThumbPrint[]) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.src && item.id) : [];
  } catch {
    return [];
  }
}

function savePrints() {
  localStorage.setItem(STORE, JSON.stringify(prints));
}

async function refreshFolder() {
  folderEl.textContent = await folderLabel();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that picture.'));
    image.src = src;
  });
}

function setStatus(text: string, error = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', error);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
