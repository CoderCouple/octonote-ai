import type { DiagramModel } from './generate';

// The browser side of a host's diagram route (octodraw-server or the host's
// own): POSTs { system, messages } and streams the reply text back. The API
// key lives only on the server.

export interface HttpModelOptions {
  /** Extra headers, e.g. the host's auth token. */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Custom fetch (tests, non-browser runtimes). */
  fetch?: typeof fetch;
  /** Send cookies with the request (same-site auth). */
  credentials?: RequestCredentials;
}

const ERROR_MARK = '\n\n[octodraw-error] ';

/** A DiagramModel that calls a diagram route over HTTP and streams its text reply. */
export function httpDiagramModel(url: string, options: HttpModelOptions = {}): DiagramModel {
  const doFetch = options.fetch ?? fetch;
  return async function* ({ system, messages, signal }) {
    const extra = typeof options.headers === 'function' ? await options.headers() : (options.headers ?? {});
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extra },
      body: JSON.stringify({ system, messages }),
      signal,
      credentials: options.credentials,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error((detail && typeof detail.error === 'string' && detail.error) || `The diagram server answered ${response.status}`);
    }
    if (!response.body) {
      yield await response.text();
      return;
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    // Hold back a little text so an in-band error marker split across chunks is still recognised.
    let pending = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += value;
      const marker = pending.indexOf(ERROR_MARK);
      if (marker >= 0) throw new Error(pending.slice(marker + ERROR_MARK.length).trim() || 'The diagram request failed.');
      const safe = Math.max(0, pending.length - ERROR_MARK.length);
      if (safe > 0) {
        yield pending.slice(0, safe);
        pending = pending.slice(safe);
      }
    }
    const marker = pending.indexOf(ERROR_MARK);
    if (marker >= 0) throw new Error(pending.slice(marker + ERROR_MARK.length).trim() || 'The diagram request failed.');
    if (pending) yield pending;
  };
}

/** Whether a diagram route is reachable and has a key configured (its GET status). */
export async function diagramServerStatus(url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; configured: boolean; model?: string }> {
  try {
    const response = await fetchImpl(url, { method: 'GET' });
    if (!response.ok) return { ok: false, configured: false };
    const data = (await response.json()) as { configured?: boolean; model?: string };
    return { ok: true, configured: !!data.configured, model: data.model };
  } catch {
    return { ok: false, configured: false };
  }
}
