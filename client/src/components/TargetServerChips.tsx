import { useState } from 'react';
import { Icon } from './Icon';

export function TargetServerChips({ value, onChange }: { value: string[]; onChange: (names: string[]) => void }) {
  const [pending, setPending] = useState('');

  const add = () => {
    const name = pending.trim();
    if (!name || value.includes(name)) return;
    onChange([...value, name]);
    setPending('');
  };

  return (
    <div className="chip-list">
      {value.map((name) => (
        <span className="chip" key={name}>
          {name}
          <button onClick={() => onChange(value.filter((n) => n !== name))} aria-label={`Remove ${name}`}>
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <div className="chip-add">
        <input
          placeholder="target-server-name"
          className="mono"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="btn btn-sm" type="button" onClick={add} disabled={!pending.trim()}>
          <Icon name="plus" size={12} /> Add
        </button>
      </div>
    </div>
  );
}
