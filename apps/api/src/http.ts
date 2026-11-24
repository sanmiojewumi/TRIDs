export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function bad(message: string, status = 400, code?: string): never {
  throw new HttpError(status, message, code);
}
