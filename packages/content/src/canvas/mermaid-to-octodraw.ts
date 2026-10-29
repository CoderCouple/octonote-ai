import { flowchartToOctodraw } from "./flowchart-to-octodraw";
import { isClassDiagram, parseMermaidClassDiagram } from "./mermaid-class";
import { parseMermaidFlowchart } from "./mermaid-flowchart";
import type { CanvasDocument } from "./octodraw-types";

/**
 * A mermaid flowchart or class diagram → an octodraw canvas document, laid
 * out. Throws `MermaidParseError` for anything else (sequence, gantt, …).
 */
export function mermaidToOctodraw(source: string): CanvasDocument {
  return flowchartToOctodraw(
    isClassDiagram(source) ? parseMermaidClassDiagram(source) : parseMermaidFlowchart(source),
  );
}
