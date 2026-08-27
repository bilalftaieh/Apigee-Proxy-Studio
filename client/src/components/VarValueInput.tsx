import type { VarValue } from '../types/proxy';
import { Icon } from './Icon';

export function VarValueInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: VarValue;
  onChange: (v: VarValue) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const isVariable = value.mode === 'variable';
  return (
    <div className="varvalue-input" style={style}>
      {isVariable && <span className="varvalue-brace">{'{'}</span>}
      <input
        className={isVariable ? 'mono' : undefined}
        value={value.value}
        placeholder={isVariable ? 'e.g. target.url' : placeholder}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
      />
      {isVariable && <span className="varvalue-brace">{'}'}</span>}
      <button
        type="button"
        className={`varvalue-toggle ${value.mode}`}
        onClick={() => onChange({ ...value, mode: isVariable ? 'literal' : 'variable' })}
        title={isVariable ? 'Switch to a hardcoded value' : 'Switch to a variable reference'}
      >
        <Icon name={isVariable ? 'braces' : 'type'} size={12} />
        {isVariable ? 'Variable' : 'Hardcode'}
      </button>
    </div>
  );
}
