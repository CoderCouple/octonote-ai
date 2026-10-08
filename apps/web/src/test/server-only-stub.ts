// Vitest alias target for the `server-only` package. The real module
// throws when imported outside an RSC build, which we don't want during
// unit tests. The alias is wired up in vitest.config.ts.
export {};
