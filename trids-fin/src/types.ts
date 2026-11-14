export type Kind = 'in' | 'out';

export interface Entry {
  id: string;
  kind: Kind;
  /** Amount in pence. */
  amount: number;
  date: string;
  category: string;
  note: string;
}

export interface Books {
  version: 1;
  entries: Entry[];
}
