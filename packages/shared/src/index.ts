import { z } from "zod";

export * from "./ids";
import { ID_PREFIXES, type IdPrefix } from "./ids";

// =============================================================================
// ID validators
// =============================================================================

const UUID_BODY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.source;

function prefixedId<P extends IdPrefix>(prefix: P) {
  return z.string().regex(new RegExp(`^${prefix}_${UUID_BODY}$`), {
    message: `Expected ${prefix}_<uuid> id`,
  });
}

export const UserIdSchema = prefixedId(ID_PREFIXES.user);
export const WorkspaceIdSchema = prefixedId(ID_PREFIXES.workspace);
export const WorkspaceMemberIdSchema = prefixedId(ID_PREFIXES.workspaceMember);
export const NotebookIdSchema = prefixedId(ID_PREFIXES.notebook);
export const ProjectIdSchema = prefixedId(ID_PREFIXES.project);
export const ResourceShareIdSchema = prefixedId(ID_PREFIXES.resourceShare);
export const PageIdSchema = prefixedId(ID_PREFIXES.page);
export const CanvasIdSchema = prefixedId(ID_PREFIXES.canvas);
export const CanvasSnapshotIdSchema = prefixedId(ID_PREFIXES.canvasSnapshot);
export const ChangeEventIdSchema = prefixedId(ID_PREFIXES.changeEvent);

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  timestamp: z.string(),
});

// =============================================================================
// Workspaces
// =============================================================================

export const WorkspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

const SlugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase letters, digits, hyphens");

export const WorkspaceCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: SlugSchema.optional(),
});

export const WorkspaceUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: SlugSchema.optional(),
});

export const WorkspaceSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WorkspaceMemberSchema = z.object({
  id: WorkspaceMemberIdSchema,
  workspaceId: WorkspaceIdSchema,
  userId: UserIdSchema,
  role: WorkspaceRoleSchema,
  createdAt: z.string(),
  user: z
    .object({
      id: UserIdSchema,
      name: z.string(),
      email: z.string(),
      avatarUrl: z.string().nullable(),
    })
    .optional(),
});

// =============================================================================
// Per-resource settings (UI prefs in DB)
// =============================================================================

export const ProjectViewSchema = z.enum(["notes", "canvas", "split"]);

export const ProjectSettingsSchema = z
  .object({
    defaultView: ProjectViewSchema.optional(),
  })
  .passthrough();

export const PageSettingsSchema = z
  .object({
    font: z.enum(["sans", "serif", "mono"]).optional(),
    lineWidth: z.enum(["narrow", "default", "wide"]).optional(),
  })
  .passthrough();

export const CanvasSettingsSchema = z
  .object({
    showGrid: z.boolean().optional(),
    snapToGrid: z.boolean().optional(),
  })
  .passthrough();

// =============================================================================
// Sharing + publishing (Google Docs model)
// =============================================================================

export const ResourceKindSchema = z.enum(["page", "canvas", "project", "notebook"]);
/** Grantable to a person or via "anyone with the link". */
export const ShareRoleSchema = z.enum(["viewer", "editor"]);
/** Effective role of the caller; owner = workspace OWNER/ADMIN or creator in the chain. */
export const AccessRoleSchema = z.enum(["viewer", "editor", "owner"]);
export const LinkAccessSchema = z.enum(["restricted", "anyone_with_link"]);
export const ShareStatusSchema = z.enum(["active", "pending", "revoked"]);

/** Embedded in every shareable resource DTO. */
const SharingFields = {
  linkAccess: LinkAccessSchema,
  linkRole: ShareRoleSchema,
  publicSlug: z.string().nullable(),
  publishedAt: z.string().nullable(),
  /** Caller's effective role; set on single-resource fetches. */
  myRole: AccessRoleSchema.optional(),
};

export const GeneralAccessUpdateSchema = z.object({
  linkAccess: LinkAccessSchema,
  linkRole: ShareRoleSchema.default("viewer"),
});

export const PublishUpdateSchema = z.object({
  published: z.boolean(),
});

export const PublishStateSchema = z.object({
  resourceKind: ResourceKindSchema,
  resourceId: z.string(),
  published: z.boolean(),
  publicSlug: z.string().nullable(),
  publicUrl: z.string().nullable(),
  /** Set when this resource is public only because an ancestor is published. */
  publishedVia: z
    .object({ kind: ResourceKindSchema, id: z.string(), name: z.string() })
    .nullable(),
});

export const ShareCreateSchema = z.object({
  resourceKind: ResourceKindSchema,
  resourceId: z.string(),
  email: z.string().email().transform((e) => e.toLowerCase()),
  role: ShareRoleSchema.default("viewer"),
});

export const ShareUpdateSchema = z.object({
  role: ShareRoleSchema,
});

export const ShareSchema = z.object({
  id: ResourceShareIdSchema,
  resourceKind: ResourceKindSchema,
  resourceId: z.string(),
  role: ShareRoleSchema,
  status: ShareStatusSchema,
  /** Present once the grantee has an account. */
  user: z
    .object({ id: UserIdSchema, name: z.string(), email: z.string(), avatarUrl: z.string().nullable() })
    .nullable(),
  /** Present while the invite is pending (no account yet). */
  pendingEmail: z.string().nullable(),
  createdAt: z.string(),
});

/** Moves a standalone note/canvas or a project in or out of a notebook. */
export const MoveToNotebookSchema = z.object({
  notebookId: NotebookIdSchema.nullable(),
});

// =============================================================================
// Notebooks — folder-like; an item is in at most one notebook
// =============================================================================

export const NotebookCreateSchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().max(50).optional(),
});

export const NotebookUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  icon: z.string().max(50).nullable().optional(),
});

export const NotebookSchema = z.object({
  id: NotebookIdSchema,
  workspaceId: WorkspaceIdSchema,
  createdByUserId: UserIdSchema,
  name: z.string(),
  icon: z.string().nullable(),
  ...SharingFields,
  createdAt: z.string(),
  updatedAt: z.string(),
});

// =============================================================================
// Projects — eraser-style files: exactly one note + one canvas, owned by the project
// =============================================================================

export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  icon: z.string().max(50).optional(),
  notebookId: NotebookIdSchema.optional(),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  settings: ProjectSettingsSchema.optional(),
});

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  workspaceId: WorkspaceIdSchema,
  notebookId: NotebookIdSchema.nullable(),
  createdByUserId: UserIdSchema,
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  settings: ProjectSettingsSchema,
  ...SharingFields,
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  /** Set by list endpoints only; undefined on single-resource fetches. */
  hasNote: z.boolean().optional(),
  hasCanvas: z.boolean().optional(),
});

// =============================================================================
// Notes (pages)
// =============================================================================

/** Standalone note. A project's note is created with its project. */
export const PageCreateSchema = z.object({
  title: z.string().min(1).max(120).default("Untitled"),
  notebookId: NotebookIdSchema.optional(),
});

export const PageUpdateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  document: z.unknown().optional(),
  contentMd: z.string().optional(),
  settings: PageSettingsSchema.optional(),
});

export const PageSchema = z.object({
  id: PageIdSchema,
  workspaceId: WorkspaceIdSchema,
  projectId: ProjectIdSchema.nullable(),
  notebookId: NotebookIdSchema.nullable(),
  title: z.string(),
  document: z.unknown(),
  contentMd: z.string(),
  settings: PageSettingsSchema,
  ...SharingFields,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

// =============================================================================
// Canvases
// =============================================================================

/** Standalone canvas. A project's canvas is created with its project. */
export const CanvasCreateSchema = z.object({
  title: z.string().min(1).max(120).default("Untitled canvas"),
  notebookId: NotebookIdSchema.optional(),
});

export const CanvasUpdateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  document: z.unknown().optional(),
  /** Supabase Storage URL of a PNG the client uploaded; validated server-side. */
  thumbnailUrl: z.string().url().max(2000).nullable().optional(),
  settings: CanvasSettingsSchema.optional(),
});

export const CanvasSchema = z.object({
  id: CanvasIdSchema,
  workspaceId: WorkspaceIdSchema,
  projectId: ProjectIdSchema.nullable(),
  notebookId: NotebookIdSchema.nullable(),
  title: z.string(),
  document: z.unknown(),
  /** PNG snapshot used by the notes `canvasReference` block; null until first save. */
  thumbnailUrl: z.string().nullable(),
  settings: CanvasSettingsSchema,
  ...SharingFields,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** Props of the `canvasReference` BlockNote block. Reference only — never renders tldraw inline. */
export const CanvasReferenceBlockPropsSchema = z.object({
  canvasId: CanvasIdSchema,
});

// =============================================================================
// Audit
// =============================================================================

export const ChangeEventSchema = z.object({
  id: ChangeEventIdSchema,
  workspaceId: WorkspaceIdSchema,
  userId: UserIdSchema.nullable(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  patch: z.unknown().nullable(),
  createdAt: z.string(),
});

// =============================================================================
// User preferences
// =============================================================================

export const NotesFontFamilySchema = z.enum([
  "fraunces",
  "instrument-serif",
  "georgia",
  "newsreader",
  "inter",
  "geist",
  "system",
  "ia-writer-mono",
]);
export const NotesFontSizeSchema = z.enum(["sm", "md", "lg", "xl"]);
export const NotesLineHeightSchema = z.enum(["compact", "normal", "relaxed"]);
export const ThemeSchema = z.enum(["system", "light", "dark"]);

export const UserPreferenceSchema = z.object({
  userId: UserIdSchema,
  notesFontFamily: NotesFontFamilySchema,
  notesFontSize: NotesFontSizeSchema,
  notesLineHeight: NotesLineHeightSchema,
  theme: ThemeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const UserPreferenceUpdateSchema = z.object({
  notesFontFamily: NotesFontFamilySchema.optional(),
  notesFontSize: NotesFontSizeSchema.optional(),
  notesLineHeight: NotesLineHeightSchema.optional(),
  theme: ThemeSchema.optional(),
});

// =============================================================================
// Types
// =============================================================================

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type WorkspaceCreate = z.infer<typeof WorkspaceCreateSchema>;
export type WorkspaceUpdate = z.infer<typeof WorkspaceUpdateSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export type ResourceKind = z.infer<typeof ResourceKindSchema>;
export type ShareRole = z.infer<typeof ShareRoleSchema>;
export type AccessRole = z.infer<typeof AccessRoleSchema>;
export type LinkAccess = z.infer<typeof LinkAccessSchema>;
export type ShareStatus = z.infer<typeof ShareStatusSchema>;
export type GeneralAccessUpdate = z.infer<typeof GeneralAccessUpdateSchema>;
export type PublishUpdate = z.infer<typeof PublishUpdateSchema>;
export type PublishState = z.infer<typeof PublishStateSchema>;
export type ShareCreate = z.infer<typeof ShareCreateSchema>;
export type ShareUpdate = z.infer<typeof ShareUpdateSchema>;
export type Share = z.infer<typeof ShareSchema>;
export type MoveToNotebook = z.infer<typeof MoveToNotebookSchema>;

export type Notebook = z.infer<typeof NotebookSchema>;
export type NotebookCreate = z.infer<typeof NotebookCreateSchema>;
export type NotebookUpdate = z.infer<typeof NotebookUpdateSchema>;

export type ProjectView = z.infer<typeof ProjectViewSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type PageSettings = z.infer<typeof PageSettingsSchema>;
export type CanvasSettings = z.infer<typeof CanvasSettingsSchema>;

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;

export type Page = z.infer<typeof PageSchema>;
export type PageCreate = z.infer<typeof PageCreateSchema>;
export type PageUpdate = z.infer<typeof PageUpdateSchema>;

export type Canvas = z.infer<typeof CanvasSchema>;
export type CanvasCreate = z.infer<typeof CanvasCreateSchema>;
export type CanvasUpdate = z.infer<typeof CanvasUpdateSchema>;
export type CanvasReferenceBlockProps = z.infer<typeof CanvasReferenceBlockPropsSchema>;

export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

export type NotesFontFamily = z.infer<typeof NotesFontFamilySchema>;
export type NotesFontSize = z.infer<typeof NotesFontSizeSchema>;
export type NotesLineHeight = z.infer<typeof NotesLineHeightSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type UserPreference = z.infer<typeof UserPreferenceSchema>;
export type UserPreferenceUpdate = z.infer<typeof UserPreferenceUpdateSchema>;
