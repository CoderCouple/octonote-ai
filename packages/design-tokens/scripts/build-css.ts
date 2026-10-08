import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderCss } from "../src/css";

const out = join(__dirname, "..", "tokens.css");
writeFileSync(out, renderCss());
console.log(`wrote ${out}`);
