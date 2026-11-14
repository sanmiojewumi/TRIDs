import { useMemo, useState } from 'preact/hooks';
import logo from '../assets/trids-logo.png';
import { categories, formatPounds, monthKey, monthLabel, monthTotals, poundsToPence, shiftMonth } from '../money';
import { actions, todayISO, useBooks } from '../store';
import type { Entry, Kind } from '../types';

type Filter = 'all' | Kind;

export function App() {
  const books = useBooks();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Entry | 'in' | 'out' | null>(null);
  const totals = monthTotals(books.entries, month);
  const rows = useMemo(
    () =>
      books.entries
        .filter((entry) => monthKey(entry.date) === month && (filter === 'all' || entry.kind === filter))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [books.entries, month, filter],
  );

  return (
    <div class="app">
      <header class="top">
        <img src={logo} alt="" />
        <div>
          <strong>Trids Fin</strong>
          <span>Income and expenses</span>
        </div>
      </header>
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
      <ul class="list">
        {rows.length === 0 && <li class="empty">Nothing in {monthLabel(month)} yet. Add money in or money out.</li>}
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
      {editing && <Editor entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Editor(props: { entry: Entry | Kind; onClose: () => void }) {
  const existing = typeof props.entry === 'string' ? null : props.entry;
  const [kind, setKind] = useState<Kind>(existing?.kind ?? (props.entry as Kind));
  const [amount, setAmount] = useState(existing ? (existing.amount / 100).toFixed(2) : '');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [category, setCategory] = useState(existing?.category ?? categories(existing?.kind ?? (props.entry as Kind))[0]);
  const [note, setNote] = useState(existing?.note ?? '');
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
        <button
          type="button"
          class="btn danger"
          onClick={() => {
            actions.remove(existing.id);
            props.onClose();
          }}
        >
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
