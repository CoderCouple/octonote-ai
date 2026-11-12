import { useMemo, useState } from "react";
import journey from "@octonote/motion/examples/food-journey.json";
import { CountUp, DrawPath, FadeIn, Highlight, parseScene, ScaleIn, ScenePlayer, sceneToolDefinition, Stagger, Typewriter, type Theme } from "@octonote/motion";

type Source = "scene" | "primitives" | "paste";

export function MotionDemo({ theme }: { theme: Theme }) {
  const [source, setSource] = useState<Source>("scene");
  const [pasted, setPasted] = useState(() => JSON.stringify(journey, null, 2));
  const parsed = useMemo(() => parseScene(pasted), [pasted]);

  return (
    <div className="mo-root" data-mo-theme={theme}>
      <div className="pg-bar">
        <p className="pg-hint">Animated explainers from validated JSON, and the building blocks for animating your own UI.</p>
        <div className="pg-subtabs" role="tablist" aria-label="Motion demo">
          {(
            [
              ["scene", "Explainer scene"],
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

      {source === "scene" ? <ScenePlayer spec={journey} theme={theme} /> : null}
      {source === "primitives" ? <Primitives /> : null}
      {source === "paste" ? (
        <div className="pg-split">
          <div className="pg-panel">
            <label htmlFor="pg-motion-json">A scene. Edit steps or positions and watch it replay.</label>
            <textarea id="pg-motion-json" value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} rows={20} />
            <details>
              <summary>The tool definition for models</summary>
              <pre>{JSON.stringify(sceneToolDefinition(), null, 2)}</pre>
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
        <svg viewBox="0 0 400 90" className="pg-draw" aria-label="A wavy line, like peristalsis">
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
