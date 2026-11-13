/** Where Octonote lives, fixed when the extension is built (see build.mjs). Pages can't change these. */
export interface Environment {
  id: string;
  label: string;
  /** Where the connect page and collections open. */
  web: string;
  /** Origins allowed to hand the extension a connect code. */
  webOrigins: string[];
  api: string;
}

declare const __ENVIRONMENTS__: Environment[];
declare const __CHAT_ORIGINS__: string[];

export const ENVIRONMENTS: Environment[] = __ENVIRONMENTS__;
export const CHAT_ORIGINS: string[] = __CHAT_ORIGINS__;

export function environment(id: string | undefined): Environment | undefined {
  return ENVIRONMENTS.find((e) => e.id === id);
}
