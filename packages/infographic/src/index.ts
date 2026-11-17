export { Infographic, InfographicRenderer } from "./infographic.js";
export type { Theme } from "./infographic.js";
export { Icon, ICON_NAMES } from "./icons.js";
export type { IconName } from "./icons.js";
export {
  familyOf,
  infographicSchema,
  itemSchema,
  ITEM_COUNTS,
  ITEM_STYLES,
  LAYOUT_FAMILIES,
  LAYOUT_STYLES,
  LAYOUTS,
  LIMITS,
  PALETTES,
  SCHEMA_VERSION,
  TONES,
} from "./schema.js";
export type { InfographicContent, InfographicItem, InfographicSpec, ItemStyle, Layout, LayoutFamily, Palette, Tone, ValidationResult } from "./schema.js";
export { upgradeLegacy, validateInfographic } from "./validate.js";
export { INFOGRAPHIC_GUIDE } from "./guide.js";
export { infographicJsonSchema } from "./json-schema.js";
