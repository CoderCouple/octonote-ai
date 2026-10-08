/**
 * Back-compat re-export shim. All schema definitions now live under
 * db/schemas/*. New code should import from "./schemas" or a specific
 * domain file directly.
 */
export * from "./schemas";
