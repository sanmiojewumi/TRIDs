import { useMemo, useState } from 'preact/hooks';
import logo from '../assets/trids-logo.png';
import { accountBalance, categories, formatPounds, monthKey, monthLabel, monthTotals, poundsToPence, shiftMonth } from '../money';
import { actions, todayISO, useBooks } from '../store';
import type { AccountKind, Entry, Kind, MoneyAccount, Section, SectionKind } from '../types';

type Filter = 'all' | Kind;

export function App() {
  const books = useBooks();
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [accountEditor, setAccountEditor] = useState<MoneyAccount | 'new' | null>(null);
  const open = books.profiles.find((profile) => profile.id === openId) ?? null;

  const go = (id: string | null) => {
    setOpenId(id);
    setMenu(false);
  };

  return (
    <div class="app">
      <header class="bar">
        <button type="button" class="menu-btn" aria-label="Menu" onClick={() => setMenu(true)}>
          <span />
          <span />
          <span />
        </button>
        <div>
          <strong>{open ? open.name : 'Trids Fin'}</strong>
          <span>{open ? (open.kind === 'home' ? 'Home' : 'Business') : 'Income and expenses'}</span>
        </div>
        <img src={logo} alt="" />
      </header>
      {open ? <Ledger profile={open} onGone={() => setOpenId(null)} /> : <Landing onOpen={go} onAdd={() => setAdding(true)} onAccount={() => setAccountEditor('new')} />}
      {menu && (
        <Menu
          openId={openId}
          onClose={() => setMenu(false)}
          onOpen={go}
          onAdd={() => { setMenu(false); setAdding(true); }}
          onAccount={(account) => { setMenu(false); setOpenId(account.profileId); setAccountEditor(account); }}
          onNewAccount={() => { setMenu(false); setAccountEditor('new'); }}
        />
      )}
      {accountEditor && (
        <AccountForm
          account={accountEditor === 'new' ? null : accountEditor}
          profileId={open?.id ?? books.profiles[0]?.id ?? 'home'}
          onClose={() => setAccountEditor(null)}
        />
      )}
      {adding && (
        <AddSection
          onClose={() => setAdding(false)}
          onSave={(name, kind) => {
            const section = actions.addSection(name, kind);
            setAdding(false);
            setOpenId(section.id);
          }}
        />
      )}
    </div>
  );
}

function Landing(props: { onOpen: (id: string) => void; onAdd: () => void; onAccount: () => void }) {
  const books = useBooks();
  const month = monthKey(todayISO());
  const all = monthTotals(books.entries, month);
  const homes = books.profiles.filter((profile) => profile.kind === 'home');
  const businesses = books.profiles.filter((profile) => profile.kind === 'business');
  return (
    <div class="landing">
      <section class="hero">
        <img src={logo} alt="" />
        <p>Your money, kept on this phone.</p>
        <div class="hero-left">
          <span>{monthLabel(month)}</span>
          <b class={all.left < 0 ? 'down' : ''}>{formatPounds(all.left)} left</b>
        </div>
      </section>
      <h2>Home</h2>
      {homes.map((profile) => (
        <ProfileCard key={profile.id} profile={profile} month={month} onOpen={props.onOpen} />
      ))}
      <h2>Sources of income</h2>
      {businesses.map((profile) => (
        <ProfileCard key={profile.id} profile={profile} month={month} onOpen={props.onOpen} />
      ))}
      <button type="button" class="btn save" onClick={props.onAdd}>Add a business</button>
      <button type="button" class="btn ghost" onClick={props.onAccount}>Add an account</button>
    </div>
  );
}

function ProfileCard(props: { profile: Section; month: string; onOpen: (id: string) => void }) {
  const books = useBooks();
  const totals = monthTotals(books.entries, props.month, props.profile.id);
  return (
    <button type="button" class={`card ${props.profile.kind}`} onClick={() => props.onOpen(props.profile.id)}>
      <span>
        <strong>{props.profile.name}</strong>
        <small>{props.profile.kind === 'home' ? 'Personal' : 'Business'}</small>
      </span>
      <span class="card-figs">
        <em class="in">+{formatPounds(totals.income)}</em>
        <em class="out">−{formatPounds(totals.expense)}</em>
        <b class={totals.left < 0 ? 'down' : ''}>{formatPounds(totals.left)}</b>
      </span>
    </button>
  );
}

function Menu(props: {
  openId: string | null;
  onClose: () => void;
  onOpen: (id: string | null) => void;
  onAdd: () => void;
  onAccount: (account: MoneyAccount) => void;
  onNewAccount: () => void;
}) {
  const books = useBooks();
  return (
    <>
      <button type="button" class="scrim" aria-label="Close menu" onClick={props.onClose} />
      <aside class="drawer">
        <div class="who">
          <img src={logo} alt="" />
          <div>
            <strong>Trids Fin</strong>
            <span>Gas and Plumbing</span>
          </div>
        </div>
        <button type="button" class={props.openId === null ? 'nav-row on' : 'nav-row'} onClick={() => props.onOpen(null)}>
          Overview
        </button>
        <h2>Home</h2>
        {books.profiles
          .filter((profile) => profile.kind === 'home')
          .map((profile) => (
            <button key={profile.id} type="button" class={props.openId === profile.id ? 'nav-row on' : 'nav-row'} onClick={() => props.onOpen(profile.id)}>
              {profile.name}
            </button>
          ))}
        <h2>Businesses</h2>
        {books.profiles
          .filter((profile) => profile.kind === 'business')
          .map((profile) => (
            <button key={profile.id} type="button" class={props.openId === profile.id ? 'nav-row on' : 'nav-row'} onClick={() => props.onOpen(profile.id)}>
              {profile.name}
            </button>
          ))}
        <h2>Accounts</h2>
        {books.accounts.map((account) => (
          <button key={account.id} type="button" class="nav-row" onClick={() => props.onAccount(account)}>
            {account.name}
            <small>{books.profiles.find((profile) => profile.id === account.profileId)?.name}</small>
          </button>
        ))}
        <button type="button" class="nav-row" onClick={props.onNewAccount}>Add an account</button>
        <button type="button" class="btn save drawer-add" onClick={props.onAdd}>Add a business</button>
      </aside>
    </>
  );
}

function Ledger(props: { profile: Section; onGone: () => void }) {
  const books = useBooks();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [filter, setFilter] = useState<Filter>('all');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | Kind | null>(null);
  const [accountEditor, setAccountEditor] = useState<MoneyAccount | 'new' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const accounts = books.accounts.filter((account) => account.profileId === props.profile.id);
  const totals = monthTotals(books.entries, month, props.profile.id);
  const rows = useMemo(
    () =>
      books.entries
        .filter((entry) => entry.profileId === props.profile.id && monthKey(entry.date) === month && (filter === 'all' || entry.kind === filter) && (!accountId || entry.accountId === accountId))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [books.entries, month, filter, accountId, props.profile.id],
  );

  return (
    <>
      <div class="month-bar">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <h1>{monthLabel(month)}</h1>
        <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
      </div>
      <section class="totals">
        <button type="button" class={filter === 'in' ? 'on' : ''} onClick={() => setFilter(filter === 'in' ? 'all' : 'in')}>
          <span>In</span>
          <b>{formatPounds(totals.income)}</b>
        </button>
        <button type="button" class={filter === 'out' ? 'on' : ''} onClick={() => setFilter(filter === 'out' ? 'all' : 'out')}>
          <span>Out</span>
          <b>{formatPounds(totals.expense)}</b>
        </button>
        <div>
          <span>Left</span>
          <b class={totals.left < 0 ? 'down' : ''}>{formatPounds(totals.left)}</b>
        </div>
      </section>
      <div class="account-row">
        {accounts.map((account) => (
          <button key={account.id} type="button" class={accountId === account.id ? 'account on' : 'account'} onClick={() => setAccountId(accountId === account.id ? null : account.id)}>
            <span>{account.name}</span>
            <b>{formatPounds(accountBalance(account, books.entries))}</b>
          </button>
        ))}
      </div>
      <div class="inline-links">
        <button type="button" class="text-btn" onClick={() => setAccountEditor('new')}>Add account</button>
        {accountId && (
          <button type="button" class="text-btn" onClick={() => setAccountEditor(accounts.find((account) => account.id === accountId) ?? 'new')}>
            Manage account
          </button>
        )}
        <button type="button" class="text-btn" onClick={() => setRenaming(true)}>Edit this section</button>
      </div>
      <ul class="list">
        {rows.length === 0 && <li class="empty">Nothing in {monthLabel(month)} for {props.profile.name} yet.</li>}
        {rows.map((entry) => (
          <li key={entry.id}>
            <button type="button" class="row" onClick={() => setEditing(entry)}>
              <span>
                <strong>{entry.category}</strong>
                <small>
                  {labelDate(entry.date)}
                  {entry.note ? ` · ${entry.note}` : ''}
                </small>
              </span>
              <b class={entry.kind === 'in' ? 'in' : 'out'}>
                {entry.kind === 'in' ? '+' : '−'}
                {formatPounds(entry.amount)}
              </b>
            </button>
          </li>
        ))}
      </ul>
      <div class="actions">
        <button type="button" class="btn in" onClick={() => setEditing('in')}>Add income</button>
        <button type="button" class="btn out" onClick={() => setEditing('out')}>Add expense</button>
      </div>
      {editing && <Editor profileId={props.profile.id} accountId={accountId} entry={editing} onClose={() => setEditing(null)} />}
      {accountEditor && <AccountForm account={accountEditor === 'new' ? null : accountEditor} profileId={props.profile.id} onClose={() => setAccountEditor(null)} />}
      {renaming && (
        <RenameSection
          profile={props.profile}
          canRemove={books.profiles.length > 1}
          onClose={() => setRenaming(false)}
          onRemove={() => {
            actions.removeSection(props.profile.id);
            props.onGone();
          }}
        />
      )}
    </>
  );
}

function AddSection(props: { onClose: () => void; onSave: (name: string, kind: SectionKind) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SectionKind>('business');
  const [error, setError] = useState('');
  return (
    <div class="screen">
      <header>
        <button type="button" aria-label="Close" onClick={props.onClose}>×</button>
        <h2>New section</h2>
      </header>
      <div class="choice">
        <button type="button" class={kind === 'home' ? 'on' : ''} onClick={() => setKind('home')}>Home</button>
        <button type="button" class={kind === 'business' ? 'on' : ''} onClick={() => setKind('business')}>Business</button>
      </div>
      <label>
        Name
        <input value={name} placeholder={kind === 'home' ? 'Home' : 'Business name'} onInput={(event) => setName((event.target as HTMLInputElement).value)} />
      </label>
      {error && <p class="error">{error}</p>}
      <button
        type="button"
        class="btn save"
        onClick={() => {
          if (!name.trim()) {
            setError('Enter a name.');
            return;
          }
          props.onSave(name, kind);
        }}
      >
        Add section
      </button>
    </div>
  );
}

function RenameSection(props: { profile: Section; canRemove: boolean; onClose: () => void; onRemove: () => void }) {
  const [name, setName] = useState(props.profile.name);
  return (
    <div class="screen">
      <header>
        <button type="button" aria-label="Close" onClick={props.onClose}>×</button>
        <h2>Edit section</h2>
      </header>
      <label>
        Name
        <input value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} />
      </label>
      <button
        type="button"
        class="btn save"
        onClick={() => {
          if (!name.trim()) return;
          actions.renameSection(props.profile.id, name);
          props.onClose();
        }}
      >
        Save name
      </button>
      {props.canRemove && (
        <button type="button" class="btn danger" onClick={props.onRemove}>
          Remove this section
        </button>
      )}
    </div>
  );
}

function AccountForm(props: { account: MoneyAccount | null; profileId: string; onClose: () => void }) {
  const books = useBooks();
  const [profileId, setProfileId] = useState(props.account?.profileId ?? props.profileId);
  const [name, setName] = useState(props.account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(props.account?.kind ?? 'bank');
  const [opening, setOpening] = useState(props.account ? (props.account.opening / 100).toFixed(2) : '0.00');
  const [error, setError] = useState('');
  const siblings = books.accounts.filter((account) => account.profileId === (props.account?.profileId ?? profileId));
  return (
    <div class="screen">
      <header>
        <button type="button" aria-label="Close" onClick={props.onClose}>×</button>
        <h2>{props.account ? 'Manage account' : 'New account'}</h2>
      </header>
      {!props.account && (
        <label>
          Section
          <select value={profileId} onChange={(event) => setProfileId((event.target as HTMLSelectElement).value)}>
            {books.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Account name
        <input value={name} placeholder="Bank, cash, card" onInput={(event) => setName((event.target as HTMLInputElement).value)} />
      </label>
      <div class="choice kinds">
        {(['cash', 'bank', 'card'] as AccountKind[]).map((item) => (
          <button key={item} type="button" class={kind === item ? 'on' : ''} onClick={() => setKind(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
        ))}
      </div>
      <label>
        Opening balance
        <input inputMode="decimal" value={opening} onInput={(event) => setOpening((event.target as HTMLInputElement).value)} />
      </label>
      {error && <p class="error">{error}</p>}
      <button
        type="button"
        class="btn save"
        onClick={() => {
          if (!name.trim()) {
            setError('Enter an account name.');
            return;
          }
          const trimmed = opening.trim();
          const openingPence = /^0+(\.0{1,2})?$/.test(trimmed) ? 0 : poundsToPence(trimmed);
          if (openingPence == null) {
            setError('Enter an opening balance, or 0.');
            return;
          }
          actions.saveAccount({
            id: props.account?.id ?? crypto.randomUUID(),
            profileId: props.account?.profileId ?? profileId,
            name,
            kind,
            opening: openingPence,
          });
          props.onClose();
        }}
      >
        Save account
      </button>
      {props.account && siblings.length > 1 && (
        <button type="button" class="btn danger" onClick={() => { actions.removeAccount(props.account!.id); props.onClose(); }}>
          Remove account
        </button>
      )}
    </div>
  );
}

function Editor(props: { profileId: string; accountId: string | null; entry: Entry | Kind; onClose: () => void }) {
  const books = useBooks();
  const accounts = books.accounts.filter((account) => account.profileId === props.profileId);
  const existing = typeof props.entry === 'string' ? null : props.entry;
  const initialKind: Kind = typeof props.entry === 'string' ? props.entry : props.entry.kind;
  const [kind, setKind] = useState<Kind>(initialKind);
  const [amount, setAmount] = useState(existing ? (existing.amount / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [category, setCategory] = useState(existing?.category ?? categories(existing?.kind ?? (props.entry as Kind))[0]);
  const [note, setNote] = useState(existing?.note ?? '');
  const [chosenAccount, setChosenAccount] = useState(existing?.accountId ?? props.accountId ?? accounts[0]?.id ?? '');
  const [error, setError] = useState('');

  const chooseKind = (next: Kind) => {
    setKind(next);
    if (!categories(next).includes(category)) setCategory(categories(next)[0]);
  };

  const save = () => {
    const pence = poundsToPence(amount);
    if (pence == null) {
      setError('Enter an amount above zero, such as 85 or 12.50.');
      return;
    }
    if (!date) {
      setError('Choose a date.');
      return;
    }
    actions.save({
      id: existing?.id ?? crypto.randomUUID(),
      profileId: existing?.profileId ?? props.profileId,
      accountId: chosenAccount || accounts[0]?.id || '',
      kind,
      amount: pence,
      date,
      category,
      note: note.trim(),
    });
    props.onClose();
  };

  return (
    <div class="screen">
      <header>
        <button type="button" aria-label="Close" onClick={props.onClose}>×</button>
        <h2>{existing ? 'Edit entry' : kind === 'in' ? 'Income' : 'Expense'}</h2>
      </header>
      <div class="choice">
        <button type="button" class={kind === 'in' ? 'on' : ''} onClick={() => chooseKind('in')}>Income</button>
        <button type="button" class={kind === 'out' ? 'on' : ''} onClick={() => chooseKind('out')}>Expense</button>
      </div>
      <label>
        Amount
        <input inputMode="decimal" value={amount} placeholder="0.00" onInput={(event) => setAmount((event.target as HTMLInputElement).value)} />
      </label>
      <label>
        Date
        <input type="date" value={date} onInput={(event) => setDate((event.target as HTMLInputElement).value)} />
      </label>
      <label>
        Account
        <select value={chosenAccount} onChange={(event) => setChosenAccount((event.target as HTMLSelectElement).value)}>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select value={category} onChange={(event) => setCategory((event.target as HTMLSelectElement).value)}>
          {categories(kind).map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Note
        <input value={note} placeholder="Optional" onInput={(event) => setNote((event.target as HTMLInputElement).value)} />
      </label>
      {error && <p class="error">{error}</p>}
      <button type="button" class="btn save" onClick={save}>Save</button>
      {existing && (
        <button type="button" class="btn danger" onClick={() => { actions.remove(existing.id); props.onClose(); }}>
          Delete
        </button>
      )}
    </div>
  );
}

function labelDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
