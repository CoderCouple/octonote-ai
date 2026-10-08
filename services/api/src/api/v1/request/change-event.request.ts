import { z } from "zod";

export const ChangeEventListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  entityType: z.string().optional(),
  entityId: z.string().min(1).max(64).optional(),
});

export type ChangeEventListQuery = z.infer<typeof ChangeEventListQuerySchema>;
