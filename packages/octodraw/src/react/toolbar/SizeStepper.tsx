import { SIZE_NAMES } from './actions';
import { Segmented } from './OptionList';

const NAMES: Record<(typeof SIZE_NAMES)[number], string> = { small: 'Small', medium: 'Medium', large: 'Large' };

/** − Npx + over Small / Medium / Large. `size` undefined shows "Mixed". */
export function SizeStepper({ size, named, min, max, onStep, onName }: { size: number | undefined; named: string | undefined; min: number; max: number; onStep: (size: number) => void; onName: (name: (typeof SIZE_NAMES)[number]) => void }) {
  return (
    <>
      <div className="od-etb-stepper">
        <button type="button" role="menuitem" className="od-etb-step" aria-label="Smaller" title="Smaller" disabled={size !== undefined && size <= min} onClick={() => onStep(Math.max(min, (size ?? 14) - 1))}>
          −
        </button>
        <span className="od-etb-step-value" aria-live="polite">{size === undefined ? 'Mixed' : `${size}px`}</span>
        <button type="button" role="menuitem" className="od-etb-step" aria-label="Larger" title="Larger" disabled={size !== undefined && size >= max} onClick={() => onStep(Math.min(max, (size ?? 14) + 1))}>
          +
        </button>
      </div>
      <Segmented label="Size" options={SIZE_NAMES.map((value) => ({ value, label: NAMES[value] }))} value={named} onPick={onName} />
    </>
  );
}
