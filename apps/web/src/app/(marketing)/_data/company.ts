/**
 * Facts about the company, shown on /about and sent to search engines as the
 * schema.org Organization (Google's company panel reads both). Real facts only:
 * leave a list empty rather than guess.
 */

/** Shown on /about and sent as the Organization's `founder`. */
export const FOUNDERS: { name: string; role: string; url?: string }[] = [
  {
    name: "Sunil Tiwari",
    role: "Co-founder & CEO",
    url: "https://www.linkedin.com/in/sdtiwari/",
  },
  {
    name: "Payal Fofadiya",
    role: "Co-founder & CPO",
    url: "https://www.linkedin.com/in/payalfofadiya/",
  },
];

/** Official profiles; sent as `sameAs` so Google ties them to octonote.ai. */
export const PROFILES: { label: string; url: string }[] = [
  { label: "LinkedIn", url: "https://www.linkedin.com/company/octonote-ai/" },
];
