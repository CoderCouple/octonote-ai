/**
 * "Help & feedback" email, pre-filled for debugging: the user writes at the
 * top; below a divider sit the details we'd otherwise have to ask for.
 * Shared by web and mobile so both send the same shape.
 */
export const SUPPORT_EMAIL = "hello@octonote.ai";

export interface SupportContext {
  /** "Web", "iOS", "Android". */
  platform: string;
  appVersion?: string;
  /** OS / browser details, e.g. "iOS 18.2" or the browser user agent. */
  system?: string;
  device?: string;
  userId?: string;
  email?: string;
  workspaceName?: string;
  workspaceId?: string;
  /** Where the user was, e.g. the current page path. */
  location?: string;
}

export function supportMailto(ctx: SupportContext, now = new Date()): string {
  const details: [string, string | undefined][] = [
    ["Platform", ctx.platform],
    ["App version", ctx.appVersion],
    ["System", ctx.system],
    ["Device", ctx.device],
    ["User ID", ctx.userId],
    ["Email", ctx.email],
    ["Workspace", ctx.workspaceName],
    ["Workspace ID", ctx.workspaceId],
    ["Page", ctx.location],
    [
      "Time",
      `${now.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
    ],
  ];
  const body = [
    "",
    "",
    "",
    "———— Please write your message above this line ————",
    "These details help us look into problems. Remove anything you'd rather not share.",
    "",
    ...details.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
  ].join("\n");
  const subject = `Octonote AI feedback (${ctx.platform})`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
