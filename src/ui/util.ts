
export const val = (e: Event) => (e.target as HTMLInputElement).value;

export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
}

interface SavePdfPlugin {
  toDownloads(options: { filename: string; data: string; mime?: string }): Promise<{ saved: boolean; name?: string }>;
  save(options: { filename: string; data: string; mime?: string }): Promise<{ saved: boolean }>;
}

function savePdfPlugin(): Promise<SavePdfPlugin> {
  return import('@capacitor/core').then(({ registerPlugin }) => registerPlugin<SavePdfPlugin>('SavePdf'));
}

function safeName(filename: string): string {
  return filename.replace(/[\\/]/g, '-');
}

/** Writes the file into the phone's Downloads folder. */
async function saveToDownloads(blob: Blob, filename: string): Promise<string> {
  const SavePdf = await savePdfPlugin();
  const { name } = await SavePdf.toDownloads({
    filename: safeName(filename),
    data: await blobToBase64(blob),
    mime: blob.type || 'application/octet-stream',
  });
  return name ? `Downloads/${name}` : 'Downloads';
}

/** Opens the system save screen so the user can pick the folder. */
async function saveNative(blob: Blob, filename: string): Promise<boolean> {
  const SavePdf = await savePdfPlugin();
  const { saved } = await SavePdf.save({
    filename: safeName(filename),
    data: await blobToBase64(blob),
    mime: blob.type || 'application/octet-stream',
  });
  return saved;
}

/** On the Android app, hand the file to the system share sheet so it can be saved or sent. */
async function handOffNative(blob: Blob, filename: string, title: string) {
  const { Directory, Filesystem } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const safe = filename.replace(/[\\/]/g, '-');
  await Filesystem.writeFile({ path: safe, data: await blobToBase64(blob), directory: Directory.Cache });
  const { uri } = await Filesystem.getUri({ path: safe, directory: Directory.Cache });
  try {
    await Share.share({ title, files: [uri], dialogTitle: title });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/cancel/i.test(msg)) throw e;
  }
}

export async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  if (isNativeApp()) {
    await saveToDownloads(blob, filename);
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export interface StoredFile {
  saved: boolean;
  where?: string;
}

/** Download straight into Downloads (phone) or the browser's download folder. */
export async function downloadToDevice(blob: Blob, filename: string): Promise<StoredFile> {
  if (isNativeApp()) return { saved: true, where: await saveToDownloads(blob, filename) };
  await downloadBlob(blob, filename);
  return { saved: true, where: 'your downloads folder' };
}

/** Let the user pick the folder. Resolves saved:false when they cancel. */
export async function saveToChosenFolder(blob: Blob, filename: string): Promise<StoredFile> {
  if (isNativeApp()) {
    const saved = await saveNative(blob, filename);
    return { saved, where: saved ? 'the folder you chose' : undefined };
  }
  const picker = (window as Window & { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
  if (!picker) {
    await downloadBlob(blob, filename);
    return { saved: true, where: 'your downloads folder' };
  }
  try {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: blob.type === 'application/json' ? 'JSON' : 'PDF', accept: { [blob.type || 'application/pdf']: [blob.type === 'application/json' ? '.json' : '.pdf'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { saved: true, where: 'the folder you chose' };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { saved: false };
    throw e;
  }
}

export function canChooseFolder(): boolean {
  return isNativeApp() || typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

export function canShareFile(blob: Blob, filename: string): boolean {
  try {
    const file = new File([blob], filename, { type: 'application/pdf' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareBlob(blob: Blob, filename: string, title: string) {
  if (isNativeApp()) {
    await handOffNative(blob, filename, title);
    return;
  }
  const file = new File([blob], filename, { type: 'application/pdf' });
  try {
    await navigator.share({ files: [file], title });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
  }
}

export function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function shrinkImage(file: File, maxW = 600): Promise<{ dataUrl: string; ratio: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL('image/png'), ratio: w / h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

export function backupFileName(): string {
  return `invoice-desk-backup-${new Date().toISOString().slice(0, 10)}.json`;
}
