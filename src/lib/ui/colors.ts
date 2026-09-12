export const CURSOR_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324',
] as const;

export function pickColor(index: number): string {
  return CURSOR_COLORS[((index % CURSOR_COLORS.length) + CURSOR_COLORS.length) % CURSOR_COLORS.length];
}
