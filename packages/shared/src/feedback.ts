/**
 * "Report a bug" / "Request a feature": what people send from the web and
 * mobile apps, and what staff see in Admin → Feedback.
 */
import { z } from "zod";

export const FEEDBACK_KINDS = ["bug", "feature"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "Bug",
  feature: "Feature request",
};

export const FEEDBACK_STATUSES = ["new", "planned", "done", "wont_do"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  planned: "Planned",
  done: "Done",
  wont_do: "Won't do",
};

export const FEEDBACK_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type FeedbackScreenshotType = (typeof FEEDBACK_SCREENSHOT_TYPES)[number];
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

const detail = (max: number) => z.string().trim().max(max).optional();

/** What the app knows about where the report was sent from. */
export const FeedbackContextSchema = z.object({
  /** "Web", "iOS", "Android". */
  platform: detail(20),
  appVersion: detail(60),
  /** Browser and OS, or the OS version. */
  system: detail(400),
  device: detail(120),
  /** Window size, e.g. "1440×900". */
  screen: detail(30),
  /** The page or screen they were on. */
  page: detail(500),
  timeZone: detail(60),
  /** Approximate, from the connection; never GPS. */
  city: detail(100),
  region: detail(100),
  country: detail(100),
});
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;

export const FeedbackCreateSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(1, "Write a few words first.").max(5000),
  workspaceId: z.string().max(64).optional(),
  screenshot: z
    .object({
      contentType: z.enum(FEEDBACK_SCREENSHOT_TYPES),
      /** Base64; the API checks the real size and format. */
      data: z.string().min(1).max(Math.ceil((FEEDBACK_SCREENSHOT_MAX_BYTES * 4) / 3) + 4),
    })
    .optional(),
  context: FeedbackContextSchema.default({}),
});
export type FeedbackCreate = z.infer<typeof FeedbackCreateSchema>;

export const FeedbackUpdateSchema = z
  .object({
    status: z.enum(FEEDBACK_STATUSES).optional(),
    teamNote: z.string().trim().max(5000).optional(),
  })
  .refine((v) => v.status !== undefined || v.teamNote !== undefined, "Nothing to change.");
export type FeedbackUpdate = z.infer<typeof FeedbackUpdateSchema>;

export interface FeedbackItem extends FeedbackContext {
  id: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  message: string;
  teamNote: string | null;
  userId: string;
  email: string;
  workspaceId: string | null;
  workspaceName: string | null;
  plan: string | null;
  hasScreenshot: boolean;
  /** Only when one item is opened; a link that expires. */
  screenshotUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackList {
  items: FeedbackItem[];
  counts: { newBugs: number; newRequests: number; planned: number };
}
