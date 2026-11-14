import type { NavApp } from '../types';

const OPTIONS: { id: NavApp; label: string }[] = [
  { id: 'google', label: 'Google Maps' },
  { id: 'waze', label: 'Waze' },
];

export function NavChoice(props: { value: NavApp; onChange: (app: NavApp) => void }) {
  return (
    <div class="choice" role="group" aria-label="Satnav for the whole route">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          class={props.value === option.id ? 'btn primary' : 'btn'}
          aria-pressed={props.value === option.id}
          onClick={() => props.onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
