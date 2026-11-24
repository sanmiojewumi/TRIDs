export function internalApi(path: string) {
  return `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}${path}`;
}

export async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(internalApi(path), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
