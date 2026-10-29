import { useMemo, useState, type CSSProperties } from 'react';
import { OctoDiagram, themeCssVariables, lightTheme } from '@octonote/octodraw';

// Side-by-side view for reverse-engineering Eraser's layout: for each corpus
// example, octodraw's layout of the DSL next to Eraser's generated JSON
// (drawn by octodraw's renderer) and Eraser's own PNG export.

const sources = import.meta.glob<string>('../../../corpus/*.eraser', { query: '?raw', import: 'default', eager: true });
const jsons = import.meta.glob<string>('../../../corpus/*.json', { query: '?raw', import: 'default', eager: true });
const pngs = import.meta.glob<string>('../../../corpus/*.png', { query: '?url', import: 'default', eager: true });

interface Example {
  name: string;
  source: string;
  json?: string;
  png?: string;
}

const EXAMPLES: Example[] = Object.entries(sources)
  .map(([path, source]) => {
    const base = path.replace(/\.eraser$/, '');
    return { name: base.split('/').at(-1)!, source, json: jsons[`${base}.json`], png: pngs[`${base}.png`] };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function Compare() {
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get('compare') || EXAMPLES[0]?.name || '');
  const example = EXAMPLES.find((e) => e.name === selected) ?? EXAMPLES[0];
  const vars = useMemo(() => themeCssVariables(lightTheme) as CSSProperties, []);

  const select = (name: string) => {
    setSelected(name);
    history.replaceState(null, '', `?compare=${encodeURIComponent(name)}`);
  };

  return (
    <div className="compare" style={vars}>
      <aside className="compare-list">
        <h1>Corpus</h1>
        <p>
          {EXAMPLES.filter((e) => e.json).length} / {EXAMPLES.length} with Eraser output
        </p>
        {EXAMPLES.map((e) => (
          <button key={e.name} type="button" aria-current={e.name === example?.name} onClick={() => select(e.name)}>
            <span>{e.name}</span>
            <span className="compare-tags">
              {e.json && <span title="Eraser JSON">json</span>}
              {e.png && <span title="Eraser PNG">png</span>}
            </span>
          </button>
        ))}
      </aside>
      {example && (
        <main className="compare-panes">
          <section>
            <h2>
              octodraw
              <button
                type="button"
                className="compare-copy"
                onClick={() =>
                  navigator.clipboard.writeText(example.source).then(
                    () => setCopied(example.name),
                    () => setCopied(null),
                  )
                }
              >
                {copied === example.name ? 'Copied ✓' : 'Copy code for Eraser'}
              </button>
            </h2>
            <OctoDiagram key={`ours-${example.name}`} source={example.source} colorScheme="light" style={{ flex: 1 }} />
          </section>
          <section>
            <h2>Eraser JSON</h2>
            {example.json ? (
              <OctoDiagram key={`eraser-${example.name}`} source={example.json} colorScheme="light" style={{ flex: 1 }} />
            ) : (
              <Missing file={`${example.name}.json`} />
            )}
          </section>
          <section>
            <h2>Eraser PNG</h2>
            {example.png ? <img src={example.png} alt={`Eraser rendering of ${example.name}`} /> : <Missing file={`${example.name}.png`} />}
          </section>
        </main>
      )}
    </div>
  );
}

function Missing({ file }: { file: string }) {
  return (
    <div className="compare-missing">
      <span>
        Add <code>corpus/{file}</code>
      </span>
    </div>
  );
}
