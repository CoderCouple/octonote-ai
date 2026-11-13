/**
 * The connect handshake's proof (as in OAuth's PKCE): the extension keeps a
 * random verifier and sends only its SHA-256 (the challenge) to the connect
 * page. The page gets a one-time code bound to that challenge; only the
 * extension, which holds the verifier, can turn the code into a token.
 */
export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}
