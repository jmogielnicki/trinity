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
  /** 'inline' (default) shows the value to the right; 'above-thumb' floats it over the handle */
  labelPosition?: 'inline' | 'above-thumb';
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
  labelPosition = 'inline',
}: StepSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : String(value);

  const track = (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      className="step-slider w-full"
      style={{ '--sp': `${pct}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );

  if (labelPosition === 'above-thumb') {
    return (
      <div className="flex flex-col gap-0.5">
        {/* thumb-width = 16px; formula keeps label centered over thumb at both extremes */}
        <div className="relative pt-6">
          <span
            className="absolute top-0 text-sm font-bold text-text tabular-nums pointer-events-none"
            style={{
              left: `calc(${pct / 100} * (100% - 16px) + 8px)`,
              transform: 'translateX(-50%)',
            }}
          >
            {display}
          </span>
          {track}
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

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        {track}
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
