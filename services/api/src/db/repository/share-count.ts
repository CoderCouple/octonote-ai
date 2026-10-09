import { getTableName, sql, type Table } from "drizzle-orm";
import type { ResourceKind } from "../../model/sharing.model";
import { resourceShares } from "../schemas/sharing";

/**
 * Correlated subquery: live (non-revoked) "people with access" grants on each
 * row of `table`. The outer id is table-qualified explicitly — in single-table
 * selects Drizzle emits bare column names, and a bare "id" here would resolve
 * to resource_shares.id.
 */
export function liveShareCount(kind: ResourceKind, table: Table) {
  const outerId = sql.raw(`"${getTableName(table)}"."id"`);
  return sql<number>`(select count(*)::int from ${resourceShares} where ${resourceShares.resourceKind} = ${kind} and ${resourceShares.resourceId} = ${outerId} and ${resourceShares.status} <> 'revoked')`;
}
