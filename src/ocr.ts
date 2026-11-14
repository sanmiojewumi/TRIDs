/** Reads the writing in a picture. On the phone this uses the built-in reader. */

function nativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
}

/** Shrinks a screenshot so only the writing is scanned, not the full camera pixels. */
export function shrinkImage(file: Blob, maxEdge = 1280): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not prepare the picture'));
        return;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the picture'))), 'image/jpeg', 0.72);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not open that picture'));
    };
    img.src = url;
  });
}

async function readNative(blob: Blob): Promise<string> {
  const { registerPlugin } = await import('@capacitor/core');
  const ReadText = registerPlugin<{ read(options: { data: string }): Promise<{ text?: string }> }>('ReadText');
  const result = await ReadText.read({ data: await blobToBase64(blob) });
  return (result.text || '').trim();
}

let reader: Promise<{ recognize(image: Blob): Promise<{ data: { text: string } }> }> | undefined;

async function readFallback(blob: Blob): Promise<string> {
  if (!reader) {
    reader = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        langPath: `${import.meta.env.BASE_URL}tessdata`,
        gzip: true,
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })();
  }
  const worker = await reader;
  const result = await worker.recognize(blob);
  return (result.data.text || '').trim();
}

export async function readImageText(file: Blob): Promise<string> {
  const small = await shrinkImage(file);
  if (nativeApp()) {
    try {
      const text = await readNative(small);
      if (text) return text;
    } catch {
      /* The built-in reader can fail on an unusual picture. The fallback still runs on the phone. */
    }
  }
  return readFallback(small);
}
