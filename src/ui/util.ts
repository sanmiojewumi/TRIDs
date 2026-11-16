
export const val = (e: Event) => (e.target as HTMLInputElement).value;

export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  const platform = cap?.getPlatform?.();
  return platform === 'android' || platform === 'ios';
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
  folder(): Promise<{ connected: boolean; name?: string; pick?: string; pickId?: string }>;
  pickFolder(): Promise<{ connected: boolean; name?: string }>;
  saveToFolder(options: { filename: string; data: string; mime?: string }): Promise<{ saved: boolean; name?: string; file?: string }>;
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

type DirHandle = {
  name: string;
  getFileHandle(name: string, opts: { create: boolean }): Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

let chosenDir: DirHandle | null = null;

function directoryPicker(): ((opts: { mode: 'readwrite' }) => Promise<DirHandle>) | undefined {
  return (window as Window & { showDirectoryPicker?: (opts: { mode: 'readwrite' }) => Promise<DirHandle> }).showDirectoryPicker;
}

/** The folder remembered for finished invoices, or null when none is connected. */
export async function connectedFolder(): Promise<string | null> {
  if (!isNativeApp()) return chosenDir?.name ?? null;
  const SavePdf = await savePdfPlugin();
  const folder = await SavePdf.folder();
  return folder.connected ? folder.name || 'chosen folder' : null;
}

/** Ask for the folder invoices should be saved in, and remember it. */
export async function connectFolder(): Promise<string | null> {
  if (!isNativeApp()) {
    const picker = directoryPicker();
    if (!picker) return null;
    try {
      chosenDir = await picker({ mode: 'readwrite' });
      return chosenDir.name;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }
  const SavePdf = await savePdfPlugin();
  const before = await SavePdf.folder();
  const outcome = await waitForFolderPick(before.pickId ?? '');
  if (outcome !== 'ok') return null;
  const folder = await SavePdf.folder();
  return folder.connected ? folder.name || 'chosen folder' : null;
}

function waitForFolderPick(previousId: string): Promise<'ok' | 'cancel' | 'timeout'> {
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const finish = (outcome: 'ok' | 'cancel' | 'timeout') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('trids-resume', check);
      document.removeEventListener('visibilitychange', check);
      resolve(outcome);
    };
    const check = () => {
      void savePdfPlugin().then(async (SavePdf) => {
        const status = await SavePdf.folder();
        if (!status.pickId || status.pickId === previousId) return;
        finish(status.pick === 'ok' ? 'ok' : 'cancel');
      }).catch(() => finish('timeout'));
    };
    window.addEventListener('trids-resume', check);
    document.addEventListener('visibilitychange', check);
    timer = window.setTimeout(() => finish('timeout'), 120_000);
    window.location.assign('trids://pick-folder');
  });
}

async function writeChosenDir(blob: Blob, filename: string): Promise<StoredFile> {
  if (!chosenDir) return { saved: false };
  const file = await chosenDir.getFileHandle(safeName(filename), { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
  return { saved: true, where: `${chosenDir.name}/${safeName(filename)}` };
}

/** Opens the phone's save screen so the PDF is written into a folder the user can open. */
async function saveWithPhoneDialog(blob: Blob, filename: string): Promise<StoredFile> {
  const SavePdf = await savePdfPlugin();
  const { saved } = await SavePdf.save({
    filename: safeName(filename),
    data: await blobToBase64(blob),
    mime: 'application/pdf',
  });
  return { saved, where: saved ? `your phone / ${safeName(filename)}` : undefined };
}

/** Download into the folder chosen for invoices. */
export async function downloadToDevice(blob: Blob, filename: string): Promise<StoredFile> {
  if (isNativeApp()) {
    const folder = await connectedFolder();
    if (folder) {
      const SavePdf = await savePdfPlugin();
      try {
        const saved = await SavePdf.saveToFolder({
          filename: safeName(filename),
          data: await blobToBase64(blob),
          mime: 'application/pdf',
        });
        return { saved: true, where: `${saved.name || folder}/${saved.file || safeName(filename)}` };
      } catch {
        /* The remembered folder could not be written. Ask for a folder on the phone. */
      }
    }
    return saveWithPhoneDialog(blob, filename);
  }
  if (chosenDir) return writeChosenDir(blob, filename);
  await downloadBlob(blob, filename);
  return { saved: true, where: 'your downloads folder' };
}

export function canChooseFolder(): boolean {
  return isNativeApp() || typeof directoryPicker() === 'function';
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
