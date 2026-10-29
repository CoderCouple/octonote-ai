import { stripComment } from './parse';

// Which of Eraser's diagram types a piece of code is. Eraser picks the type in
// its UI; octodraw infers it from the code (and hosts can override it).

export type DiagramType = 'flow' | 'erd' | 'sequence' | 'bpmn';

const SQL_TYPES = /^(string|text|varchar|char|int|integer|bigint|smallint|serial|bigserial|uuid|bool|boolean|float|double|decimal|numeric|real|money|date|datetime|time|timestamp|timestamptz|json|jsonb|blob|binary|bytea|enum|array|object|id|number)(\(.*\))?(\[\])?$/i;

export function detectDiagramType(source: string): DiagramType {
  let inBlock = false;
  let erdScore = 0;
  let bpmn = false;
  for (const raw of source.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    // Sequence-only statements.
    if (/^(activate|deactivate|autoNumber)\b/.test(line)) return 'sequence';
    if (/^(loop|alt|opt|par|break|else|and)\s*(\[.*\])?\s*\{\s*$/.test(line)) return 'sequence';
    if (/^notation\s+(chen|crows-feet)\s*$/.test(line)) return 'erd';
    // BPMN: flow objects typed as activities, events or gateways.
    if (/\[[^\]]*\btype\s*:\s*(activity|event|gateway)\b/.test(line)) bpmn = true;
    if (line.endsWith('{')) {
      inBlock = !/^(legend|flow)\b/.test(line);
      continue;
    }
    if (line === '}') {
      inBlock = false;
      continue;
    }
    // ERD: typed columns inside a block, or relationships between table.columns.
    if (inBlock) {
      const words = line.split(/\s+/);
      if (words.length >= 2 && !/[>[<:]/.test(line) && (SQL_TYPES.test(words[1]!) || /\b(pk|fk)\b/i.test(line))) erdScore++;
    } else if (/^[\w"]+\.[\w"]+\s*(<>|<|>|-)\s*[\w"]+(\.[\w"]+)?\s*(\[.*\])?$/.test(line)) {
      erdScore++;
    }
  }
  return erdScore > 0 ? 'erd' : bpmn ? 'bpmn' : 'flow';
}
