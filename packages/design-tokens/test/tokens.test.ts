import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderCss } from "../src/css";
import { colorTokenNames, dark, light } from "../src/themes";

describe("design tokens", () => {
  it("tokens.css is up to date with the TypeScript source", () => {
    const committed = readFileSync(join(__dirname, "..", "tokens.css"), "utf8");
    expect(committed, "Run: pnpm --filter @octonote/design-tokens build").toBe(renderCss());
  });

  it("both themes define every color token", () => {
    for (const name of colorTokenNames) {
      expect(light[name], `light.${name}`).toBeTruthy();
      expect(dark[name], `dark.${name}`).toBeTruthy();
    }
  });

  it("text on the main surfaces meets WCAG AA contrast (4.5:1)", () => {
    const pairs = [
      ["foreground", "background"],
      ["muted-foreground", "background"],
      ["primary-foreground", "primary"],
      ["foreground", "muted"],
    ] as const;
    for (const theme of [light, dark]) {
      for (const [fg, bg] of pairs) {
        expect(contrast(theme[fg], theme[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
