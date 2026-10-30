import { useEffect, useRef, useState } from 'react';
import { PALETTE_NAMES, type PaletteName, type Theme } from '../../theme/tokens';
import { MenuLabel } from './OptionList';

const NAMES: Partial<Record<PaletteName, string>> = { lightblue: 'Light blue' };
// Neutral first, then round the colour wheel (every palette name appears once).
const ORDER: readonly string[] = ['black', 'gray', 'red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'lightblue', 'blue', 'indigo', 'violet', 'purple', 'pink', 'brown'];
const SWATCHES = [...PALETTE_NAMES].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
const title = (name: string) => NAMES[name as PaletteName] ?? name.charAt(0).toUpperCase() + name.slice(1);

/** The swatch for a DSL colour value: a palette name or a raw CSS colour. */
export function swatchColor(theme: Theme, value: string | undefined): string | undefined {
  if (!value) return undefined;
  const name = value.toLowerCase() as PaletteName;
  return theme.palette[name]?.solid ?? value;
}

/**
 * Default (clears the property), the palette as swatches, and a custom colour.
 * The footer shows the code it writes.
 */
export function ColorGrid({ theme, value, mixed, label = 'Colour', property = 'color', onPick }: { theme: Theme; value: string | undefined; mixed: boolean; label?: string; property?: string; onPick: (value: string | null) => void }) {
  const [custom, setCustom] = useState(() => (value?.startsWith('#') ? value : theme.palette.blue.solid));
  const current = value?.toLowerCase();
  const isCustom = !!current && !(PALETTE_NAMES as readonly string[]).includes(current);
  // Commit when the picker closes (the native `change` event), not on every move of its handle: one change, one undo step.
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const commit = () => pick.current(el.value);
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);
  return (
    <>
      <MenuLabel>{label}</MenuLabel>
      <div className="od-etb-swatches">
        <button type="button" role="menuitemradio" aria-checked={!current && !mixed} className="od-etb-sw od-etb-sw-default" aria-label="Default" title="Default" onClick={() => onPick(null)} />
        {SWATCHES.map((name) => (
          <button key={name} type="button" role="menuitemradio" aria-checked={current === name} className="od-etb-sw" aria-label={title(name)} title={title(name)} style={{ background: theme.palette[name].solid }} onClick={() => onPick(name)} />
        ))}
        <label className="od-etb-sw od-etb-sw-custom" title="Custom colour" aria-checked={isCustom} role="menuitemradio" tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.click();
            }
          }}
        >
          <span className="od-etb-visually-hidden">Custom colour</span>
          <input ref={input} type="color" tabIndex={-1} value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
      </div>
      <div className="od-etb-color-foot">
        <span className="od-etb-color-chip" style={{ background: mixed ? undefined : (swatchColor(theme, value) ?? 'transparent') }} data-default={!value && !mixed ? '' : undefined} />
        <span>{mixed ? 'Mixed' : (value ?? 'Default')}</span>
        <code>{mixed ? 'mixed' : value ? `${property}: ${value}` : `no ${property}`}</code>
      </div>
    </>
  );
}
