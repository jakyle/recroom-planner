export type TokenPair = { view?: string; edit?: string };

export function joinUrl(token: string, origin = window.location.origin, pathname = window.location.pathname): string {
  return `${origin}${pathname}#/join/${token}`;
}

const key = (projectId: string) => `rr.tokens.${projectId}`;

export function stashTokens(projectId: string, tokens: TokenPair): void {
  const merged = { ...(readTokens(projectId) ?? {}), ...tokens };
  try { localStorage.setItem(key(projectId), JSON.stringify(merged)); } catch { /* storage unavailable */ }
}

export function readTokens(projectId: string): TokenPair | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    return raw ? (JSON.parse(raw) as TokenPair) : null;
  } catch { return null; }
}

export function clearTokens(projectId: string): void {
  try { localStorage.removeItem(key(projectId)); } catch { /* ignore */ }
}
