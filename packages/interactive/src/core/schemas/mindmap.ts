import { z } from "zod/v4";
import { LIMITS } from "../limits.js";
import { activityFields, checkUniqueIds, idSchema, textSchema, titleSchema } from "./common.js";

/**
 * Nodes are a flat list with parent ids rather than nested children. Models
 * produce flat lists more reliably, and a flat list is easy to stream and check.
 */
export const mindmapNodeSchema = z.object({
  id: idSchema,
  label: titleSchema,
  parent: idSchema.optional().describe("The parent node's id. Exactly one node, the central topic, has none."),
  note: textSchema.optional().describe("Detail shown when the node is selected."),
});

export const mindmapSchema = z
  .object({
    ...activityFields("mindmap"),
    nodes: z.array(mindmapNodeSchema).min(1).max(LIMITS.mindmapNodes),
  })
  .superRefine((spec, ctx) => {
    checkUniqueIds(spec.nodes, ctx, ["nodes"]);
    const byId = new Map(spec.nodes.map((n) => [n.id, n]));
    const roots = spec.nodes.filter((n) => n.parent === undefined);
    if (roots.length !== 1) {
      ctx.addIssue({ code: "custom", message: `Exactly one node must have no parent; found ${roots.length}`, path: ["nodes"] });
    }
    spec.nodes.forEach((node, i) => {
      if (node.parent !== undefined && !byId.has(node.parent)) {
        ctx.addIssue({ code: "custom", message: `No node has id "${node.parent}"`, path: ["nodes", i, "parent"] });
      }
    });
    const depths = new Map<string, number>();
    spec.nodes.forEach((node, i) => {
      // Walk up to the root, catching cycles and overly deep branches.
      const chain = new Set<string>();
      let current: typeof node | undefined = node;
      let depth = 0;
      while (current?.parent !== undefined) {
        const known = depths.get(current.id);
        if (known !== undefined) {
          depth += known;
          break;
        }
        if (chain.has(current.id)) {
          ctx.addIssue({ code: "custom", message: "Parents form a cycle", path: ["nodes", i, "parent"] });
          return;
        }
        chain.add(current.id);
        depth += 1;
        current = byId.get(current.parent);
      }
      depths.set(node.id, depth);
      if (depth > LIMITS.mindmapDepth) {
        ctx.addIssue({ code: "custom", message: `Deeper than ${LIMITS.mindmapDepth} levels`, path: ["nodes", i] });
      }
    });
  });

export type MindmapNode = z.infer<typeof mindmapNodeSchema>;
export type MindmapSpec = z.infer<typeof mindmapSchema>;
