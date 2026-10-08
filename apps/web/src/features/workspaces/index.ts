export { resolveActiveMembership } from "./lib/resolve-active-workspace";
export {
  createWorkspaceAction,
  deleteWorkspaceAction,
  getActiveWorkspaceIdCookie,
  renameWorkspaceAction,
  setActiveWorkspaceAction,
} from "./actions/workspaces-actions";
// Server-only api fetchers are NOT re-exported here — importing this barrel
// from a client component (settings-panel, team-switcher) would otherwise
// pull `import "server-only"` into the client bundle and fail the build.
// RSC routes import directly from `./api/workspaces-api`.
export { workspaceKeys, ACTIVE_WORKSPACE_COOKIE } from "./constants";
export type {
  MeResponse,
  MembershipSummary,
  MemberRow,
  Role,
  Workspace,
  WorkspaceCreate,
  WorkspaceMember,
  WorkspaceUpdate,
} from "./types";
