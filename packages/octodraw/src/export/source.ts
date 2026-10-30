import { createElement } from 'react';
import { detectDiagramType, type DiagramType } from '../dsl/detect';
import { parseErd } from '../dsl/erd';
import { parseDiagram } from '../dsl/parse';
import { parseSequence } from '../dsl/sequence';
import { BpmnSvg, layoutBpmn } from '../bpmn/bpmn';
import { arrangeErd, erdCollapsedFrom, ErdSvg, layoutErd } from '../erd/erd';
import type { IconSet } from '../icons/resolve';
import type { IconResolver } from '../icons/types';
import { arrangeLayout, type ViewPlacements } from '../layout/arrange';
import { layoutView, type TextMeasurer } from '../layout/layout';
import { layoutSequence, SequenceSvg } from '../sequence/sequence';
import type { Theme } from '../theme/tokens';
import { buildView } from '../view/view';
import { renderDiagramSvg, type RenderedSvg } from './svg';

export interface SourceSvgOptions {
  theme: Theme;
  type?: DiagramType;
  icons?: IconResolver;
  iconSet?: IconSet;
  /** Text measurement; the char-width estimate when left out (fine for thumbnails and servers). */
  measureText?: TextMeasurer;
  /** Hand placements of the top level (a figure's `placements`). */
  placements?: ViewPlacements;
  title?: boolean;
  padding?: number;
}

/**
 * Diagram code straight to a standalone SVG (any diagram type, top level,
 * fully expanded): parse, lay out, render. Pure apart from ELK, so it works
 * on a server and for thumbnails without mounting an OctoDiagram.
 */
export async function renderSourceSvg(source: string, options: SourceSvgOptions): Promise<RenderedSvg> {
  const { theme, icons, iconSet, measureText, padding } = options;
  const type = options.type ?? detectDiagramType(source);
  if (type === 'erd') {
    const erd = parseErd(source);
    // Saved state: tables dragged by hand (level '') and tables showing only key columns.
    const layout = arrangeErd(erd, await layoutErd(erd, { theme, measureText, collapsed: erdCollapsedFrom(options.placements) }), options.placements?.['']);
    return renderDiagramSvg({ layout: { width: layout.width, height: layout.height, nodes: [], edges: [] }, settings: parseDiagram('').settings, theme, icons, iconSet, padding, title: options.title ? erd.settings?.title : undefined, body: createElement(ErdSvg, { layout, diagram: erd, theme, icons, iconSet }) });
  }
  if (type === 'sequence') {
    const sequence = parseSequence(source);
    const layout = layoutSequence(sequence, { measureText });
    return renderDiagramSvg({ layout: { width: layout.width, height: layout.height, nodes: [], edges: [] }, settings: parseDiagram('').settings, theme, icons, iconSet, padding, title: options.title ? sequence.settings?.title : undefined, body: createElement(SequenceSvg, { layout, theme, icons, iconSet, styleMode: sequence.settings.styleMode }) });
  }
  if (type === 'bpmn') {
    const diagram = parseDiagram(source);
    const layout = layoutBpmn(diagram, { measureText, typography: theme.text });
    return renderDiagramSvg({ layout: { width: layout.width, height: layout.height, nodes: [], edges: [] }, settings: diagram.settings, theme, icons, iconSet, padding, title: options.title ? diagram.settings.title : undefined, body: createElement(BpmnSvg, { layout, theme, icons, iconSet, styleMode: diagram.settings.styleMode }) });
  }
  const diagram = parseDiagram(source);
  const view = buildView(diagram, { focus: null });
  const opts = { direction: diagram.settings.direction, wrap: diagram.settings.wrap !== 'off', typography: theme.text, measureText };
  let layout = await layoutView(view, opts);
  const top = options.placements?.[''];
  if (top) layout = arrangeLayout(view, layout, top, opts);
  return renderDiagramSvg({ layout, settings: diagram.settings, theme, icons, iconSet, padding, title: options.title ? diagram.settings.title : undefined });
}
