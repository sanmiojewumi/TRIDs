export type Kind = 'in' | 'out';

export type SectionKind = 'home' | 'business';

export interface Section {
  id: string;
  name: string;
  kind: SectionKind;
}

export interface Entry {
  id: string;
  profileId: string;
  kind: Kind;
  /** Amount in pence. */
  amount: number;
  date: string;
  category: string;
  note: string;
}

export interface Books {
  version: 1;
  profiles: Section[];
  entries: Entry[];
}
