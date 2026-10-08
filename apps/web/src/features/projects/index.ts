// Client-safe barrel. Server fetchers live in ./api/projects-api (server-only).
export { ProjectSplitView } from "./components/project-split-view";
export {
  archiveProjectClientApi,
  createProjectClientApi,
  listProjectsClientApi,
  moveProjectClientApi,
  updateProjectClientApi,
} from "./api/projects-client-api";
export { projectKeys } from "./constants";
export type { Project, ProjectWithPair } from "./types";
