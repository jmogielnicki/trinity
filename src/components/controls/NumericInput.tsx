import { useEffect, useRef, useState } from 'react';
import { FIELD_FULL } from '../ui/fieldCls';

interface Props {
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  parse?: (s: string) => number | null;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
}

function defaultFormat(v: number): string {
  return String(v);
}

function defaultParse(s: string): number | null {
  if (s.trim() === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function NumericInput({
  value,
  onChange,
  format = defaultFormat,
  parse = defaultParse,
  min,
  max,
  className = FIELD_FULL,
  placeholder,
  disabled,
  title,
}: Props) {
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);

  // Sync from prop when not being edited (e.g., preset picker changes the value)
  useEffect(() => {
    if (!focused.current) {
      setText(format(value));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (n: number) => {
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return n;
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      title={title}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parse(raw);
        if (n !== null) {
          onChange(clamp(n));
        }
      }}
      onBlur={() => {
        focused.current = false;
        const n = parse(text);
        if (n !== null) {
          const clamped = clamp(n);
          onChange(clamped);
          setText(format(clamped));
        } else {
          // Reset to last valid value
          setText(format(value));
        }
      }}
    />
  );
}
