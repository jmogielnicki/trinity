import {
  axisLabel,
  axisValues,
  DEFAULT_RANGES,
  formatAxisValue,
  sweepingAxes,
  useSweepStore,
  type Axis,
} from '../../store/sweepStore';

const AXES: Axis[] = ['withdrawalRate', 'stockPct', 'horizon'];

export function SweepSelector() {
  const sweep = useSweepStore();
  const sweeping = sweepingAxes(sweep);

  return (
    <div className="control-group">
      <div className="control-label">
        Sweep — pick up to 2 axes to vary. Others stay pinned to your editor
        values.
      </div>
      {AXES.map((axis) => {
        const cfg = sweep.axes[axis];
        const isSweep = cfg.mode === 'sweep';
        const canSweep = isSweep || sweeping.length < 2;
        const range = isSweep ? cfg : DEFAULT_RANGES[axis];
        const values = isSweep ? axisValues(cfg) : [];
        return (
          <div key={axis} className={`axis-row${isSweep ? ' axis-sweeping' : ''}`}>
            <button
              type="button"
              className="axis-toggle"
              disabled={!canSweep}
              onClick={() =>
                sweep.setAxis(
                  axis,
                  isSweep ? { mode: 'pin' } : { mode: 'sweep', ...DEFAULT_RANGES[axis] },
                )
              }
              title={isSweep ? 'pinned' : 'sweep'}
            >
              {isSweep ? '↔' : '📌'}
            </button>
            <span className="axis-name">{axisLabel(axis)}</span>
            {isSweep && (
              <div className="axis-range">
                <NumInput
                  axis={axis}
                  value={range.from}
                  onChange={(from) =>
                    sweep.setAxis(axis, { mode: 'sweep', ...range, from })
                  }
                />
                <span>→</span>
                <NumInput
                  axis={axis}
                  value={range.to}
                  onChange={(to) =>
                    sweep.setAxis(axis, { mode: 'sweep', ...range, to })
                  }
                />
                <span>step</span>
                <NumInput
                  axis={axis}
                  value={range.step}
                  onChange={(step) =>
                    sweep.setAxis(axis, { mode: 'sweep', ...range, step })
                  }
                />
                <span className="axis-count">({values.length} pts)</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumInput({
  axis,
  value,
  onChange,
}: {
  axis: Axis;
  value: number;
  onChange: (v: number) => void;
}) {
  const isPct = axis === 'withdrawalRate' || axis === 'stockPct';
  const display = isPct ? value * 100 : value;
  return (
    <input
      type="number"
      className="axis-num"
      step={isPct ? 0.25 : 1}
      value={display}
      onChange={(e) => {
        const raw = Number(e.target.value);
        onChange(isPct ? raw / 100 : raw);
      }}
    />
  );
}

export { formatAxisValue };
