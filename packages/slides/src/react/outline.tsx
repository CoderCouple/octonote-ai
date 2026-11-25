import { blockText, type NoteBlock } from "../blocks.js";
import { SLIDE_SIZE, type DeckAspect, type DeckSlide, type SlideElement } from "../model.js";
import { paint } from "./slide-view.js";

/** What a block is, in a word, for thumbnails. */
function chip(block: NoteBlock | undefined): string {
  if (!block) return "block";
  if (block.type === "interactive") return block.props?.kind === "custom" ? "app" : String(block.props?.kind ?? "block");
  return ({ manimVideo: "video", video: "video", mermaid: "diagram", figure: "figure", image: "image", table: "table" } as Record<string, string>)[block.type] ?? block.type;
}

function Sketch({ el }: { el: SlideElement }) {
  if (el.kind === "text") {
    const first = el.blocks.find((b) => blockText(b).trim());
    const big = first?.type === "heading";
    return <span className={big ? "osl-sk-title" : "osl-sk-text"}>{first ? blockText(first) : ""}</span>;
  }
  if (el.kind === "shape") return <span className="osl-sk-shape" style={{ background: paint(el.style?.fill) ?? "var(--osl-accent)", borderRadius: el.shape === "ellipse" ? "50%" : undefined }} />;
  if (el.kind === "image") return <span className="osl-sk-chip">image</span>;
  if (el.kind === "canvas") return <span className="osl-sk-chip">canvas</span>;
  return <span className="osl-sk-chip">{chip(el.blocks[0])}</span>;
}

/**
 * A light, static picture of a slide for the slide strip: each object as a
 * box where it sits, a title or a line of text, or a chip naming the block.
 * Drawing every slide live would run every app and video at once.
 */
export function SlideOutline({ slide, aspect = "16:9" }: { slide: DeckSlide; aspect?: DeckAspect }) {
  const { w, h } = SLIDE_SIZE[aspect];
  return (
    <div className="osl-outline" aria-hidden="true" style={slide.background ? { background: paint(slide.background) } : undefined}>
      {slide.elements.map((el) => (
        <div
          key={el.id}
          className={`osl-sk osl-sk-${el.kind}`}
          style={{
            left: `${(el.x / w) * 100}%`,
            top: `${(el.y / h) * 100}%`,
            width: `${(el.w / w) * 100}%`,
            height: `${(el.h / h) * 100}%`,
            ...(el.rotate ? { transform: `rotate(${el.rotate}deg)` } : {}),
            justifyContent: el.style?.vAlign === "middle" ? "center" : el.style?.vAlign === "bottom" ? "flex-end" : "flex-start",
          }}
        >
          <Sketch el={el} />
        </div>
      ))}
    </div>
  );
}
