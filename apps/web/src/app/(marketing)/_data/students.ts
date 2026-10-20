import { STUDENT_PRO_MONTHS } from "@octonote/shared";

/**
 * The /students page. Facts only: the offer is Pro free for STUDENT_PRO_MONTHS
 * from first sign-in with a school email whose ending is in
 * `student_email_suffixes` (.edu plus ~8,000 university domains loaded from
 * scripts/university-domains-sql.mjs on 2026-10-20).
 */
export const STUDENT_SCHOOLS = "nearly 8,000 universities in about 200 countries";

const months = STUDENT_PRO_MONTHS === 12 ? "a year" : `${STUDENT_PRO_MONTHS} months`;

export const STUDENT_OFFER = `Pro free for ${months}`;

export const STUDENT_POINTS = [
  {
    title: "Math that just works",
    body: "Type `$…$` and it renders as real math. Paste notes from ChatGPT, Claude or Obsidian and the equations, tables and diagrams come with them.",
  },
  {
    title: "Draw it out",
    body: "An infinite whiteboard sits next to every note. Sketch the circuit, the cell or the proof, then drop the drawing into your notes.",
  },
  {
    title: "Diagrams from text",
    body: "Write a few lines of Mermaid and get a clean flowchart, timeline or sequence diagram right in your notes.",
  },
  {
    title: "A notebook per course",
    body: "Keep each course's notes, drawings and problem sets together, and find anything by name.",
  },
  {
    title: "Share with your class",
    body: "Publish a page or a whole notebook in one click. Classmates read it without an account, and your study group can edit with you.",
  },
  {
    title: "Your notes stay yours",
    body: "Every note keeps a Markdown copy, so you can take your notes anywhere, even after you graduate.",
  },
];

export const STUDENT_STEPS = [
  {
    title: "Sign up with your school email",
    body: "Use the address your university gave you, or Sign in with Google on your school account.",
  },
  {
    title: "Pro switches on by itself",
    body: `No card and no forms: if your school is on our list, you get ${STUDENT_PRO_MONTHS} months of Pro straight away.`,
  },
  {
    title: "Start a notebook per course",
    body: "Write lecture notes, draw next to them, and publish the good ones for your class.",
  },
];

/** Math and computer science examples, from the official examples. */
export const STUDENT_EXAMPLES = [
  "gradient-descent-from-intuition-to-update-rule-2xvfev",
  "bayes-theorem-and-the-99-accurate-test-pjfmlb",
  "dijkstra-s-shortest-path-visually-0uhnao",
  "big-o-for-everyday-data-structures-do4p80",
];

export const STUDENT_FAQS = [
  {
    q: "Which schools get Pro for free?",
    a: `Any school whose email ending is on our list: every .edu address, plus ${STUDENT_SCHOOLS}. If yours is missing, email hello@octonote.ai from your school address and we'll add it.`,
  },
  {
    q: "How long is it free?",
    a: `${STUDENT_PRO_MONTHS} months from your first sign-in, with no card needed. After that you keep everything you made on the free plan, or upgrade to Pro.`,
  },
  {
    q: "Can I sign up with my personal email?",
    a: "Yes, but the free student Pro is matched on your school email. With a personal address you get the free plan: every feature, up to 10 notes, canvases, projects and notebooks.",
  },
  {
    q: "Is there a phone app?",
    a: "The iPhone and Android apps are coming soon. Until then Octonote works in your phone's browser.",
  },
  {
    q: "Can teachers use it?",
    a: "Yes. Teachers with a school email get the same offer, and can share a course notebook with the whole class through one link.",
  },
];
