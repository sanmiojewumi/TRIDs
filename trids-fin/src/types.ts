export type Kind = 'in' | 'out';

export type SectionKind = 'home' | 'business';

export interface Section {
  id: string;
  name: string;
  kind: SectionKind;
}

export type AccountKind = 'cash' | 'bank' | 'card';

export interface MoneyAccount {
  id: string;
  profileId: string;
  name: string;
  kind: AccountKind;
  /** Opening balance in pence. */
  opening: number;
}

export interface Entry {
  id: string;
  profileId: string;
  accountId: string;
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
  accounts: MoneyAccount[];
  entries: Entry[];
}
