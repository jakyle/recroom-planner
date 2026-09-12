export type Route =
  | { name: 'landing' }
  | { name: 'join'; token: string }
  | { name: 'project'; projectId: string; scenarioId: string | null }
  | { name: 'setup' }
  | { name: 'not_found'; hash: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'landing' };
  if (parts[0] === 'join' && parts[1]) return { name: 'join', token: parts[1] };
  if (parts[0] === 'setup') return { name: 'setup' };
  if (parts[0] === 'p' && parts[1]) {
    const scenarioId = parts[2] === 's' && parts[3] ? parts[3] : null;
    return { name: 'project', projectId: parts[1], scenarioId };
  }
  return { name: 'not_found', hash };
}

export function hrefFor(r: Route): string {
  switch (r.name) {
    case 'landing': return '#/';
    case 'join': return `#/join/${r.token}`;
    case 'setup': return '#/setup';
    case 'project': return r.scenarioId ? `#/p/${r.projectId}/s/${r.scenarioId}` : `#/p/${r.projectId}`;
    case 'not_found': return r.hash;
  }
}

export function navigate(r: Route): void {
  window.location.hash = hrefFor(r);
}
