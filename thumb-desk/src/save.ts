export interface PhoneBridge {
  pickDocument: () => void;
  pickFolder: () => void;
  folderPath: () => string;
  saveFile: (filename: string, base64: string, mime: string) => string;
}

type DirHandle = {
  name: string;
  getFileHandle(
    name: string,
    opts: { create: boolean },
  ): Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

let chosenDir: DirHandle | null = null;

export function phone(): PhoneBridge | undefined {
  return (window as Window & { ThumbPhone?: PhoneBridge }).ThumbPhone;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
}

export async function folderLabel(): Promise<string> {
  const bridge = phone();
  if (bridge) return bridge.folderPath() || 'Internal storage/TRIDS APPS/Thumb Desk';
  return chosenDir ? chosenDir.name : 'your downloads folder';
}

export async function chooseFolder(): Promise<void> {
  const bridge = phone();
  if (bridge) {
    bridge.pickFolder();
    return;
  }
  const picker = (window as Window & { showDirectoryPicker?: (opts: { mode: 'readwrite' }) => Promise<DirHandle> }).showDirectoryPicker;
  if (!picker) {
    throw new Error('In the browser the file downloads. On the phone, Change folder picks the folder it is saved in.');
  }
  try {
    chosenDir = await picker({ mode: 'readwrite' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    throw err;
  }
}

/** Writes the finished file. On the phone it goes into the folder chosen in the app. */
export async function saveBlob(blob: Blob, filename: string): Promise<string> {
  const bridge = phone();
  if (bridge) {
    const result = bridge.saveFile(filename, await blobToBase64(blob), blob.type || 'application/octet-stream');
    if (result === 'NEED_ACCESS') {
      throw new Error('Turn on Allow access to manage all files, come back, and tap Save again.');
    }
    if (!result || result.startsWith('ERROR:')) {
      throw new Error(result?.replace(/^ERROR:/, '') || 'The file was not saved.');
    }
    return result;
  }
  if (chosenDir) {
    const file = await chosenDir.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    return `${chosenDir.name}/${filename}`;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}
