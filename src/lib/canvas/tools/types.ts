import type { Pt } from '../../geom/transform';
import type { DocumentStore } from '../../model/store.svelte';
import type { Viewport } from '../viewport.svelte';
import type { CanvasUi } from '../ui.svelte';

export type Handle =
  | { kind: 'resize'; corner: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w' }
  | { kind: 'rotate' };

export type ToolEvent = {
  world: Pt;
  screen: Pt;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  button: number;
  hitId: string | null;
  handle: Handle | null;
  detail: number;
};

export type ToolCtx = {
  store: DocumentStore;
  viewport: Viewport;
  ui: CanvasUi;
  canEdit: boolean;
};

export interface Tool {
  readonly cursor: string;
  pointerDown(e: ToolEvent, ctx: ToolCtx): void;
  pointerMove(e: ToolEvent, ctx: ToolCtx): void;
  pointerUp(e: ToolEvent, ctx: ToolCtx): void;
  cancel(ctx: ToolCtx): void;
  key?(e: KeyboardEvent, ctx: ToolCtx): boolean;
}
