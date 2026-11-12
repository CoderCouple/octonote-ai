import { useMemo, useState } from "react";
import binarySearch from "@octonote/motion/examples/binary-search.json";
import bubbleSort from "@octonote/motion/examples/bubble-sort.json";
import circleArea from "@octonote/motion/examples/circle-area.json";
import compoundGrowth from "@octonote/motion/examples/compound-growth.json";
import pythagoras from "@octonote/motion/examples/pythagoras.json";
import sineWave from "@octonote/motion/examples/sine-wave.json";
import tcpHandshake from "@octonote/motion/examples/tcp-handshake.json";
import { CountUp, DrawPath, FadeIn, Highlight, parseScene, ScaleIn, ScenePlayer, sceneToolDefinition, Stagger, Typewriter, type Theme } from "@octonote/motion";

const EXAMPLES = [pythagoras, sineWave, circleArea, bubbleSort, binarySearch, tcpHandshake, compoundGrowth];
// Scenes Claude wrote in the last `pnpm --filter @octonote/motion eval` run, if any.
const GENERATED = Object.values(import.meta.glob<{ id: string; title?: string }>("../../../packages/motion/scripts/out/*.json", { eager: true, import: "default" }));

type Source = "gallery" | "generated" | "primitives" | "paste";

export function MotionDemo({ theme }: { theme: Theme }) {
  const [source, setSource] = useState<Source>("gallery");
  const [index, setIndex] = useState(0);
  const [generated, setGenerated] = useState(0);
  const [pasted, setPasted] = useState(() => JSON.stringify(EXAMPLES[0], null, 2));
  const parsed = useMemo(() => parseScene(pasted), [pasted]);

  return (
    <div className="mo-root" data-mo-theme={theme}>
      <div className="pg-bar">
        <p className="pg-hint">Animated explainers from validated JSON, played in the browser: scrub, step, speed up, go fullscreen or download as video.</p>
        <div className="pg-subtabs" role="tablist" aria-label="Motion demo">
          {(
            [
              ["gallery", "Explainers"],
              ...(GENERATED.length ? ([["generated", "Written by Claude"]] as const) : []),
              ["primitives", "Building blocks"],
              ["paste", "Paste JSON"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={source === value} onClick={() => setSource(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {source === "gallery" ? (
        <>
          <div className="pg-row-wrap pg-examples">
            {EXAMPLES.map((e, i) => (
              <button key={e.id} type="button" className="pg-chip" aria-pressed={i === index} onClick={() => setIndex(i)}>
                {e.title}
              </button>
            ))}
          </div>
          <ScenePlayer key={EXAMPLES[index]!.id} spec={EXAMPLES[index]} theme={theme} />
        </>
      ) : null}
      {source === "generated" && GENERATED.length ? (
        <>
          <div className="pg-row-wrap pg-examples">
            {GENERATED.map((e, i) => (
              <button key={e.id} type="button" className="pg-chip" aria-pressed={i === generated} onClick={() => setGenerated(i)}>
                {e.title ?? e.id}
              </button>
            ))}
          </div>
          <ScenePlayer key={GENERATED[generated]!.id} spec={GENERATED[generated]} theme={theme} />
        </>
      ) : null}
      {source === "primitives" ? <Primitives /> : null}
      {source === "paste" ? (
        <div className="pg-split">
          <div className="pg-panel">
            <label htmlFor="pg-motion-json">A scene. Edit it and watch it replay.</label>
            <textarea id="pg-motion-json" value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} rows={22} />
            <details>
              <summary>The tool definition for models</summary>
              <pre>{JSON.stringify(sceneToolDefinition(), null, 2).slice(0, 20000)}</pre>
            </details>
          </div>
          <ScenePlayer spec={parsed.ok ? parsed.spec : pasted} theme={theme} />
        </div>
      ) : null}
    </div>
  );
}

function Primitives() {
  const [run, setRun] = useState(0);
  const [total, setTotal] = useState(37);
  return (
    <div className="pg-motion" key={run}>
      <button type="button" className="pg-replay" onClick={() => setRun((n) => n + 1)}>
        Replay all
      </button>
      <section>
        <h3 className="pg-card-title">FadeIn, ScaleIn and Stagger</h3>
        <Stagger interval={120} immediate className="pg-chips">
          {["Mouth", "Oesophagus", "Stomach", "Small intestine", "Large intestine"].map((organ) => (
            <span key={organ} className="pg-chip">
              {organ}
            </span>
          ))}
        </Stagger>
        <div className="pg-row-wrap">
          <FadeIn from="left" immediate delay={200}>
            <span className="pg-chip">Slides in from the left</span>
          </FadeIn>
          <ScaleIn immediate delay={400}>
            <span className="pg-chip">Pops in</span>
          </ScaleIn>
        </div>
      </section>
      <section>
        <h3 className="pg-card-title">CountUp</h3>
        <p className="pg-big">
          <CountUp to={total} />
          <span className="pg-muted"> trillion cells in your body</span>
        </p>
        <button type="button" className="pg-replay" onClick={() => setTotal((t) => (t === 37 ? 100 : 37))}>
          Change the number
        </button>
      </section>
      <section>
        <h3 className="pg-card-title">DrawPath</h3>
        <svg viewBox="0 0 400 90" className="pg-draw" aria-label="A wavy line">
          <DrawPath d="M 10 45 C 60 0, 100 90, 150 45 S 240 0, 290 45 S 360 90, 390 45" duration={1600} stroke="currentColor" strokeWidth={4} strokeLinecap="round" />
        </svg>
      </section>
      <section>
        <h3 className="pg-card-title">Typewriter and Highlight</h3>
        <p className="pg-big">
          <Typewriter text="Villi increase the surface area for absorption." />
        </p>
        <p>
          The key organ is the <Highlight>small intestine</Highlight>.
        </p>
      </section>
    </div>
  );
}
