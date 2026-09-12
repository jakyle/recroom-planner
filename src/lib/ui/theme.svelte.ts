export type Theme = 'light' | 'dark' | 'system';

function read(): Theme {
  try {
    const t = localStorage.getItem('rr.theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

let current = $state<Theme>(read());

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
}

export function theme(): Theme {
  return current;
}

export function setTheme(t: Theme): void {
  current = t;
  apply(t);
  try {
    if (t === 'system') localStorage.removeItem('rr.theme');
    else localStorage.setItem('rr.theme', t);
  } catch {
    /* storage unavailable */
  }
}

export function cycleTheme(): void {
  const order: Theme[] = ['system', 'light', 'dark'];
  setTheme(order[(order.indexOf(current) + 1) % order.length]);
}
