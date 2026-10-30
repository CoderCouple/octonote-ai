/**
 * In a support session every note, canvas, project and notebook reports
 * `myRole: "viewer"`, so the apps open them read-only (no autosave against
 * the read-only API). Other requests pass through untouched.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export function asViewer(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => asViewer(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === "myRole" && typeof v === "string" ? "viewer" : asViewer(v, depth + 1);
  }
  return out;
}

@Injectable()
export class SupportViewInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { supportSessionId?: string } }>();
    if (!req?.user?.supportSessionId) return next.handle();
    return next.handle().pipe(map((body) => asViewer(body)));
  }
}
