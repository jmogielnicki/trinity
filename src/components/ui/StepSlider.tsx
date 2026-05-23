import type { CSSProperties } from 'react';

interface StepSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  minLabel?: string;
  maxLabel?: string;
}

export function StepSlider({
  value,
  onChange,
  min,
  max,
  step,
  format,
  minLabel,
  maxLabel,
}: StepSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : String(value);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className="step-slider flex-1"
          style={{ '--sp': `${pct}%` } as CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="text-sm font-semibold text-text tabular-nums w-12 text-right flex-shrink-0">
          {display}
        </span>
      </div>
      {(minLabel !== undefined || maxLabel !== undefined) && (
        <div className="flex justify-between text-2xs text-text-disabled">
          <span>{minLabel ?? min}</span>
          <span>{maxLabel ?? max}</span>
        </div>
      )}
    </div>
  );
}
