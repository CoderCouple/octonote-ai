import { useEffect, useState, type ReactNode } from "react";
import { slideSteps, slideTitle, type DeckDocument, type DeckPosition, type DeckSlide } from "../model.js";
import { SlideView, type SlideRenderers } from "./slide-view.js";
import { SlideStage } from "./stage.js";

export interface PresenterViewProps extends SlideRenderers {
  deck: DeckDocument;
  /** The slides being presented (hidden ones left out). */
  slides: DeckSlide[];
  position: DeckPosition;
  /** When the talk started (ms since epoch), for the timer. */
  startedAt: number;
  onNext: () => void;
  onPrevious: () => void;
  onGoTo: (slide: number) => void;
  onEnd: () => void;
  renderNotes?: (notes: string) => ReactNode;
  /** Extra panels under the timer (live answers and questions). */
  aside?: ReactNode;
}

const two = (n: number) => String(n).padStart(2, "0");

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(total % 60)}` : `${two(m)}:${two(total % 60)}`;
}

function Timer({ startedAt }: { startedAt: number }) {
  const [origin, setOrigin] = useState(startedAt);
  const [paused, setPaused] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setOrigin(startedAt), [startedAt]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const elapsed = (paused ?? now) - origin;
  return (
    <div className="osl-pv-panel">
      <div className="osl-pv-label">
        <span>Elapsed</span>
        <span className="osl-pv-actions">
          <button
            type="button"
            onClick={() => {
              if (paused === null) setPaused(Date.now());
              else {
                setOrigin((o) => o + (Date.now() - paused));
                setPaused(null);
              }
            }}
          >
            {paused === null ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOrigin(Date.now());
              setPaused(paused === null ? null : Date.now());
            }}
          >
            Reset
          </button>
        </span>
      </div>
      <div className="osl-pv-timer" aria-live="off">
        {formatElapsed(elapsed)}
      </div>
    </div>
  );
}

/**
 * What the presenter sees on their own screen: the current slide as the room
 * sees it, the next one, the notes, a timer and the controls.
 */
export function PresenterView({ deck, slides, position, startedAt, onNext, onPrevious, onGoTo, onEnd, renderNotes, aside, ...renderers }: PresenterViewProps) {
  const [notesSize, setNotesSize] = useState(20);
  const slide = slides[position.slide];
  const next = slides[position.slide + 1];
  const steps = slide ? slideSteps(slide) : 0;
  const stepsLeft = steps - position.step;
  return (
    <div className={`osl-pv osl-chrome`}>
      <header className="osl-pv-top">
        <strong>Presenter view</strong>
        <span className="osl-pv-spacer" />
        <span className="osl-pv-chip">
          Slide {position.slide + 1} of {slides.length}
          {steps ? ` · step ${position.step} of ${steps}` : ""}
        </span>
      </header>
      <div className="osl-pv-grid">
        <div className="osl-pv-main">
          <div className="osl-pv-current">
            {slide ? (
              <SlideStage aspect={deck.aspect} fit="contain">
                <SlideView deck={deck} slide={slide} step={position.step} mode="preview" {...renderers} />
              </SlideStage>
            ) : null}
          </div>
          <section className="osl-pv-panel osl-pv-notes" aria-label="Notes">
            <div className="osl-pv-label">
              <span>Notes</span>
              <span className="osl-pv-actions">
                <button type="button" aria-label="Smaller notes" onClick={() => setNotesSize((s) => Math.max(14, s - 2))}>
                  A−
                </button>
                <button type="button" aria-label="Larger notes" onClick={() => setNotesSize((s) => Math.min(40, s + 2))}>
                  A+
                </button>
              </span>
            </div>
            <div className="osl-pv-notes-body" style={{ fontSize: notesSize }}>
              {slide?.notes.trim() ? (renderNotes ? renderNotes(slide.notes) : <div className="osl-pv-notes-text">{slide.notes}</div>) : <p className="osl-pv-empty">No notes for this slide.</p>}
            </div>
          </section>
        </div>
        <aside className="osl-pv-side">
          <section className="osl-pv-panel">
            <div className="osl-pv-label">
              <span>{stepsLeft > 0 ? "Next on this slide" : next ? `Next · ${position.slide + 2}` : "Next"}</span>
              {next && stepsLeft <= 0 ? <span>{slideTitle(next)}</span> : null}
            </div>
            {stepsLeft > 0 ? (
              <p className="osl-pv-empty">
                {stepsLeft} more {stepsLeft === 1 ? "step" : "steps"} before the next slide.
              </p>
            ) : next ? (
              <SlideStage aspect={deck.aspect}>
                <SlideView deck={deck} slide={next} step={0} mode="preview" {...renderers} />
              </SlideStage>
            ) : (
              <p className="osl-pv-empty">This is the last slide.</p>
            )}
          </section>
          <Timer startedAt={startedAt} />
          {aside}
          <section className="osl-pv-panel">
            <div className="osl-pv-label">
              <span>Go to slide</span>
            </div>
            <ol className="osl-pv-list">
              {slides.map((s, i) => (
                <li key={s.id}>
                  <button type="button" aria-current={i === position.slide ? "true" : undefined} onClick={() => onGoTo(i)}>
                    <span className="osl-pv-num">{i + 1}</span>
                    <span>{slideTitle(s) || "Untitled slide"}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      <footer className="osl-pv-controls">
        <button type="button" onClick={onPrevious}>
          ← Back
        </button>
        <button type="button" className="osl-primary" onClick={onNext}>
          Next →
        </button>
        <span className="osl-pv-spacer" />
        <button type="button" onClick={onEnd}>
          End presentation
        </button>
      </footer>
    </div>
  );
}
