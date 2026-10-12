/**
 * Wraps a server action body so all our `*-action.ts` files return a
 * uniform discriminated union (ActionResponse<T>) instead of mixing
 * thrown errors with returned values.
 *
 *   export async function listNotesAction(workspaceId: string) {
 *     return runAction(() => listNotesApi(workspaceId));
 *   }
 *
 * Call sites narrow on `.success`:
 *
 *   const r = await listNotesAction(wsp);
 *   if (!r.success) return <ErrorState message={r.message} />;
 *   const items = r.data;
 */
import "server-only";
import {
  actionFailure,
  actionSuccess,
  ApiError,
  type ActionResponse,
} from "@octonote/api-client";

export async function runAction<T>(
  fn: () => Promise<T>,
): Promise<ActionResponse<T>> {
  try {
    return actionSuccess(await fn());
  } catch (err) {
    // API errors carry the server's own sentence and code (e.g. PLAN_LIMIT).
    if (err instanceof ApiError)
      return actionFailure(err.reason, err.code ?? undefined);
    const message = err instanceof Error ? err.message : "Unknown error";
    return actionFailure(message);
  }
}
