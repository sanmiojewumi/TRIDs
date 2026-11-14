import { createWorker } from 'tesseract.js';

/** Reads the writing in a picture. The reader is stored with the app. */
export async function readImageText(file: Blob, onStatus?: (status: string) => void): Promise<string> {
  const worker = await createWorker('eng', 1, {
    langPath: `${import.meta.env.BASE_URL}tessdata`,
    gzip: true,
    logger: (message) => onStatus?.(message.status),
  });
  try {
    const result = await worker.recognize(file);
    return (result.data.text || '').trim();
  } finally {
    await worker.terminate();
  }
}
