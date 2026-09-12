import type { DocumentStore } from '../model/store.svelte';
import type { CanvasUi, ToolName } from './ui.svelte';
import type { Viewport } from './viewport.svelte';
import type { SelectTool } from './tools/select';
import { propsOf, mergeProps } from '../model/types';

export type KeyCtx = {
  store: DocumentStore;
  ui: CanvasUi;
  viewport: Viewport;
  canEdit: boolean;
  selectTool: () => SelectTool;
  objectsAt: (world: [number, number]) => string[];
  fit: () => void;
};

const TOOL_KEYS: Record<string, ToolName> = { v: 'select', m: 'pan', x: 'measure', o: 'object', t: 'text', w: 'walkway' };

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** Canvas shortcuts (R7.5, R7.8, R7.22). Returns true when handled. */
export function handleKeyDown(e: KeyboardEvent, c: KeyCtx): boolean {
  if (isTyping(e)) return false;
  const { store, ui } = c;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === ' ') {
    ui.spaceHeld = true;
    e.preventDefault();
    return true;
  }
  if (key === 'Escape') {
    if (ui.dialog) ui.dialog = null;
    else if (ui.contextMenu) ui.contextMenu = null;
    else if (ui.tool !== 'select') {
      ui.tool = 'select';
      ui.resetMeasure();
      ui.clearTransient();
    } else {
      c.selectTool().cancel({ store, ui, viewport: c.viewport, canEdit: c.canEdit });
      store.clearSelection();
    }
    return true;
  }
  if (ctrl && key === 'z') {
    if (!c.canEdit) return true;
    if (e.shiftKey) void store.redo();
    else void store.undo();
    e.preventDefault();
    return true;
  }
  if (ctrl && key === 'y') {
    if (c.canEdit) void store.redo();
    e.preventDefault();
    return true;
  }
  if (ctrl && key === 'a') {
    const ids = [...store.objects.values()].filter((o) => o.layer_id === store.activeLayerId && store.isInteractive(o)).map((o) => o.id);
    store.select(ids);
    e.preventDefault();
    return true;
  }
  if (ctrl && key === 'd') {
    if (c.canEdit && store.selection.size) void store.duplicateObjects([...store.selection]);
    e.preventDefault();
    return true;
  }
  if (ctrl && key === 'g') {
    if (c.canEdit) void (e.shiftKey ? store.ungroupSelected() : store.groupSelected());
    e.preventDefault();
    return true;
  }
  if (ctrl && key === '0') {
    c.fit();
    e.preventDefault();
    return true;
  }
  if (ctrl) return false;

  if (key === 'Tab') {
    const under = c.objectsAt(ui.cursor);
    if (under.length) {
      const cur = under.findIndex((id) => store.selection.has(id));
      store.select([under[(cur + 1) % under.length]]);
    }
    e.preventDefault();
    return true;
  }
  if (key === 'Delete' || key === 'Backspace') {
    if (c.canEdit && store.selection.size) void store.deleteObjects([...store.selection]);
    e.preventDefault();
    return true;
  }
  if (key.startsWith('Arrow')) {
    if (!c.canEdit || store.selection.size === 0) return false;
    const step = e.shiftKey ? 12 : 1;
    const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
    const dy = key === 'ArrowUp' ? step : key === 'ArrowDown' ? -step : 0;
    void store.updateObjects([...store.selection], (o) => ({ x: o.x + dx, y: o.y + dy }), 'nudge');
    e.preventDefault();
    return true;
  }
  if (key === 'g') {
    ui.toggleGrid();
    return true;
  }
  if (key === 's') {
    ui.cycleSnap();
    return true;
  }
  if (key === 'h') {
    ui.halos = !ui.halos;
    return true;
  }
  if (key === 'r') {
    if (c.canEdit && store.selection.size) c.selectTool().rotateArmed = true;
    ui.tool = 'select';
    return true;
  }
  if (key === 'f') {
    if (c.canEdit && store.selection.size) {
      void store.updateObjects([...store.selection], (o) => ({ rot: (360 - o.rot) % 360, props: mergeProps(o, { flipped: !propsOf(o).flipped }) }), 'flip');
    }
    return true;
  }
  if (key === '?') {
    ui.contextMenu = null;
    return false;
  }
  const tool = TOOL_KEYS[key];
  if (tool) {
    if ((tool === 'object' || tool === 'text' || tool === 'walkway') && !c.canEdit) return true;
    ui.tool = tool;
    if (tool !== 'measure') ui.resetMeasure();
    return true;
  }
  return false;
}

export function handleKeyUp(e: KeyboardEvent, ui: CanvasUi): void {
  if (e.key === ' ') ui.spaceHeld = false;
}

export const SHORTCUTS: Array<[string, string]> = [
  ['V / M / X', 'Select / Pan / Measure'],
  ['O / T / W', 'Object / Text note / Walkway'],
  ['Drag on empty', 'Marquee: rightward touches, leftward encloses'],
  ['Shift-click', 'Add or remove from selection'],
  ['Arrows · Shift+Arrows', 'Nudge 1" · 1\'-0"'],
  ['R then drag', 'Rotate selection'],
  ['F', 'Flip'],
  ['Ctrl+D', 'Duplicate'],
  ['Ctrl+G · Ctrl+Shift+G', 'Group · Ungroup'],
  ['Ctrl+Z · Ctrl+Shift+Z', 'Undo · Redo (yours only)'],
  ['Tab', 'Cycle overlapping objects under the cursor'],
  ['G · S · H', 'Grid · Snap mode · Halos'],
  ['Alt while dragging', 'Free placement'],
  ['Shift while dragging', 'Lock to an axis'],
  ['Space+drag · wheel', 'Pan · Zoom'],
  ['Ctrl+0 · double-click empty', 'Zoom to fit'],
  ['Esc', 'Cancel / clear selection'],
];
