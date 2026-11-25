/**
 * Loading and checking stored decks of either version. Version-1 decks
 * (fixed layouts) are accepted and upgraded, so old saves, old CLIs and
 * agents writing the first format keep working.
 */
import { isObject } from "./blocks.js";
import { LEGACY_VERSION, legacyDeckProblems, repairLegacyDeck } from "./legacy.js";
import { cleanDeck, DECK_VERSION, deckV2Problems, type DeckDocument } from "./model.js";
import { upgradeDeck } from "./upgrade.js";

/** The problems that make a stored deck invalid, or [] when it's fine. */
export function deckProblems(value: unknown): string[] {
  if (!isObject(value)) return ["A deck must be an object with a slides list."];
  if (value.version === LEGACY_VERSION) return legacyDeckProblems(value);
  if (value.version !== DECK_VERSION) return [`Deck version must be ${DECK_VERSION} (or ${LEGACY_VERSION}, which is upgraded).`];
  return deckV2Problems(value);
}

/**
 * Any stored value → a well-formed version-2 deck: version 1 is upgraded,
 * unknown settings fall back to defaults, malformed objects and animations
 * that point at missing objects are dropped. Never throws.
 */
export function toDeckDocument(value: unknown): DeckDocument {
  const raw = isObject(value) ? value : {};
  // A deck without a version, or with layout slides, is the first format.
  const legacy = raw.version === LEGACY_VERSION || (Array.isArray(raw.slides) && raw.slides.some((s) => isObject(s) && "layout" in s && !("elements" in s)));
  return legacy ? upgradeDeck(repairLegacyDeck(raw)) : cleanDeck(raw);
}
