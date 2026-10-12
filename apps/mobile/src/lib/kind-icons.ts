/**
 * One icon per kind — the same Lucide icons the web app uses in its sidebar,
 * tables and Home cards, so both apps read the same.
 */
import type { ResourceKind } from "@octonote/shared";
import {
  BookOpen,
  FileText,
  FolderKanban,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react-native";

export const KIND_ICON: Record<ResourceKind, LucideIcon> = {
  page: FileText,
  canvas: LayoutGrid,
  project: FolderKanban,
  notebook: BookOpen,
};
