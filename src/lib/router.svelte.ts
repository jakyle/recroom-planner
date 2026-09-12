import { parseHash, type Route } from './router';

let current = $state<Route>(parseHash(window.location.hash));
window.addEventListener('hashchange', () => {
  current = parseHash(window.location.hash);
});

export function route(): Route {
  return current;
}
