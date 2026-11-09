import { useEffect, useRef, useState } from 'preact/hooks';
import { parsePence, penceToInput } from '../money';

/** Digits, with at most one decimal point and two pence digits. Empty is allowed while clearing the field. */
const MONEY = /^(\d{0,9})(\.\d{0,2})?$/;

function forEditing(pence: number): string {
  return penceToInput(pence).replace(/\.00$/, '');
}

export function MoneyField(props: { pence: number; onPence: (pence: number) => void; placeholder?: string }) {
  const [text, setText] = useState(() => forEditing(props.pence));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(penceToInput(props.pence));
  }, [props.pence]);

  return (
    <input
      inputMode="decimal"
      enterKeyHint="done"
      autocomplete="off"
      placeholder={props.placeholder ?? '0.00'}
      value={text}
      onFocus={() => {
        focused.current = true;
        setText(forEditing(props.pence));
      }}
      onInput={(e) => {
        const input = e.target as HTMLInputElement;
        const cleaned = input.value.replace(/[£,\s]/g, '');
        if (!MONEY.test(cleaned)) {
          input.value = text;
          return;
        }
        setText(cleaned);
        props.onPence(parsePence(cleaned));
      }}
      onBlur={(e) => {
        focused.current = false;
        const input = e.target as HTMLInputElement;
        const raw = input.value.replace(/[£,\s]/g, '');
        const pence = MONEY.test(raw) ? parsePence(raw) : props.pence;
        if (MONEY.test(raw)) props.onPence(pence);
        const shown = penceToInput(pence);
        input.value = shown;
        setText(shown);
      }}
    />
  );
}
