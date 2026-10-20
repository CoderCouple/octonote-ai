/**
 * Server-safe syntax highlighting for published notes' static HTML (the
 * editor uses BlockNote's Shiki highlighter once it loads). highlight.js
 * escapes the code; colours come from the code-* design tokens (globals.css).
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = {
  bash,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};
for (const [name, lang] of Object.entries(LANGUAGES))
  hljs.registerLanguage(name, lang);

/** Highlighted HTML for `code`, or null to show it as plain text. */
export function highlightCode(code: string, language?: string): string | null {
  if (!code.trim() || language === "text") return null;
  try {
    if (language && hljs.getLanguage(language))
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    const auto = hljs.highlightAuto(code, Object.keys(LANGUAGES));
    return auto.relevance >= 5 ? auto.value : null;
  } catch {
    return null;
  }
}
