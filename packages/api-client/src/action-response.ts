/**
 * Discriminated-union return type for server actions. Callers narrow on
 * `.success` instead of try/catch:
 *
 *   const r = await someAction(...);
 *   if (!r.success) return <ErrorState message={r.message} />;
 *   use(r.data);
 *
 * The `runAction` wrapper that catches and converts thrown errors lives
 * in `apps/web/src/lib/api/action.ts` because it imports Next.js's
 * `server-only`. Non-Next consumers just use the types + factories here.
 */

export type ActionResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string; errorCode?: string };

export function actionSuccess<T>(data: T): ActionResponse<T> {
  return { success: true, data };
}

export function actionFailure(message: string, errorCode?: string): ActionResponse<never> {
  return { success: false, message, ...(errorCode ? { errorCode } : {}) };
}
