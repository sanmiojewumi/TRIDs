import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export interface StoredObject {
  key: string;
  url: string;
}

export interface ObjectStorage {
  putImage(input: { bytes: Buffer; contentType: string; visibility: 'public' | 'private' }): Promise<StoredObject>;
  read(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class LocalStorage implements ObjectStorage {
  constructor(
    private root: string,
    private publicBaseUrl: string,
  ) {}

  async putImage(input: { bytes: Buffer; contentType: string; visibility: 'public' | 'private' }): Promise<StoredObject> {
    const ext = TYPES[input.contentType];
    if (!ext) throw new Error('Upload a JPEG, PNG, or WebP image');
    if (input.bytes.length > 5_000_000) throw new Error('Images must be 5MB or smaller');
    const key = `${input.visibility}/${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString('hex')}.${ext}`;
    const file = path.resolve(this.root, key);
    if (!file.startsWith(path.resolve(this.root))) throw new Error('Invalid upload path');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, input.bytes);
    return {
      key,
      url: input.visibility === 'public' ? `${this.publicBaseUrl}/media/${key}` : key,
    };
  }

  async read(key: string) {
    if (!(key.startsWith('private/') || key.startsWith('public/')) || key.includes('..')) return null;
    const file = path.resolve(this.root, key);
    if (!file.startsWith(path.resolve(this.root))) return null;
    try {
      const bytes = await readFile(file);
      const contentType = key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
}

export function contentTypeFor(filename: string, declared?: string): string | null {
  if (declared && TYPES[declared]) return declared;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}
