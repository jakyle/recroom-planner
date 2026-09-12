const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
const VULGAR: Record<string, number> = { '⅛': 0.125, '¼': 0.25, '⅜': 0.375, '½': 0.5, '⅝': 0.625, '¾': 0.75, '⅞': 0.875 };

export function roundToEighth(inches: number): number {
  return Math.round(inches * 8) / 8;
}

/** Feet-and-inches display per R6.1: `12'-6"`, fractions to the eighth. */
export function formatLength(inches: number, opts: { inchesOnly?: boolean } = {}): string {
  const sign = inches < 0 ? '-' : '';
  const v = roundToEighth(Math.abs(inches));
  if (opts.inchesOnly) {
    const whole = Math.floor(v);
    const frac = EIGHTHS[Math.round((v - whole) * 8)];
    return `${sign}${whole}${frac}"`;
  }
  const feet = Math.floor(v / 12);
  const rem = v - feet * 12;
  const whole = Math.floor(rem);
  const frac = EIGHTHS[Math.round((rem - whole) * 8)];
  return `${sign}${feet}'-${whole}${frac}"`;
}

/** Accepts 12'6", 12'-6", 12-6, 150", 12.5', 150, 3½", 0'-3 1/2", 12'. Unitless = inches. Returns inches or null. */
export function parseLength(raw: string): number | null {
  let s = raw.trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (!s) return null;
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  }
  const fi = s.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(.*)$/);
  if (fi) {
    const feet = parseFloat(fi[1]);
    const rest = fi[2].trim();
    if (!rest) return sign * feet * 12;
    const inches = parseInches(rest);
    return inches === null ? null : sign * (feet * 12 + inches);
  }
  const dash = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (dash) return sign * (parseInt(dash[1], 10) * 12 + parseFloat(dash[2]));
  const inches = parseInches(s);
  return inches === null ? null : sign * inches;
}

function parseInches(s: string): number | null {
  s = s.replace(/"$/, '').trim();
  const m = s.match(/^(\d+)?\s*(?:(\d+)\s*\/\s*(\d+)|([⅛¼⅜½⅝¾⅞]))?$/);
  if (m && (m[1] !== undefined || m[2] !== undefined || m[4] !== undefined)) {
    let v = m[1] ? parseInt(m[1], 10) : 0;
    if (m[2] && m[3]) v += parseInt(m[2], 10) / parseInt(m[3], 10);
    if (m[4]) v += VULGAR[m[4]];
    return v;
  }
  const dec = s.match(/^\d+(?:\.\d+)?$/);
  return dec ? parseFloat(s) : null;
}

/** Short form for readouts: 12'-6" → "12'-6\"" but drops the -0" for whole feet when compact. */
export function formatCompact(inches: number): string {
  const v = roundToEighth(inches);
  if (v % 12 === 0) return `${v / 12}'`;
  return formatLength(v);
}
