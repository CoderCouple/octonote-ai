import { isMediaBlock } from "../convert.js";
import { blockText, slideTitle, type DeckSlide, type NoteBlock } from "../model.js";

/** What a block is, in a word, for slide thumbnails. */
const KIND_LABEL: Record<string, string> = {
  interactive: "block",
  manimVideo: "video",
  video: "video",
  mermaid: "diagram",
  figure: "figure",
  canvasReference: "canvas",
  image: "image",
  table: "table",
  audio: "audio",
  file: "file",
};

function chip(block: NoteBlock): string {
  if (block.type === "interactive" && typeof block.props?.kind === "string") return block.props.kind === "custom" ? "app" : block.props.kind;
  return KIND_LABEL[block.type] ?? block.type;
}

/**
 * A light, static picture of a slide for the slide strip: its title, a line
 * of text, and a chip per block. Drawing every slide live would run every
 * app and video at once.
 */
export function SlideOutline({ slide }: { slide: DeckSlide }) {
  const blocks = [...slide.main, ...slide.side];
  const title = slideTitle(slide);
  const firstText = blocks.find((b) => b.type !== "heading" && !isMediaBlock(b) && blockText(b).trim());
  const chips = [...new Set(blocks.filter(isMediaBlock).map(chip))];
  if (slide.layout === "canvas") chips.unshift("canvas");
  return (
    <div className={`osl-outline osl-layout-${slide.layout}`} aria-hidden="true">
      <div className="osl-outline-title">{title || (slide.layout === "title" ? "Title" : "")}</div>
      {firstText ? <div className="osl-outline-text">{blockText(firstText)}</div> : null}
      {chips.length ? (
        <div className="osl-outline-chips">
          {chips.slice(0, 3).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
