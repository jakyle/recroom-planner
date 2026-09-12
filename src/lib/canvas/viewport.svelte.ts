import type { AABB, Pt } from '../geom/transform';

const MIN_SCALE = 10 / 12;
const MAX_SCALE = 400 / 12;

/** Pan/zoom state in px per inch; world +y is screen up (§0.1, R7.1). */
export class Viewport {
  scale = $state(2);
  tx = $state(0);
  ty = $state(0);
  width = $state(0);
  height = $state(0);
  private key = '';

  get pxPerFt(): number {
    return this.scale * 12;
  }

  toWorld(sx: number, sy: number): Pt {
    return [(sx - this.tx) / this.scale, (this.ty - sy) / this.scale];
  }

  toScreen(wx: number, wy: number): Pt {
    return [this.tx + wx * this.scale, this.ty - wy * this.scale];
  }

  /** World length of `px` screen pixels. */
  px(px: number): number {
    return px / this.scale;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    this.tx = sx - wx * this.scale;
    this.ty = sy + wy * this.scale;
    this.persist();
  }

  setZoom(pxPerFt: number): void {
    this.zoomAt(this.width / 2, this.height / 2, pxPerFt / 12 / this.scale);
  }

  pan(dx: number, dy: number): void {
    this.tx += dx;
    this.ty += dy;
    this.persist();
  }

  fitTo(box: AABB, pad = 48): void {
    const w = Math.max(1, box.maxX - box.minX);
    const h = Math.max(1, box.maxY - box.minY);
    const scale = Math.min((this.width - 2 * pad) / w, (this.height - 2 * pad) / h);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    this.tx = this.width / 2 - cx * this.scale;
    this.ty = this.height / 2 + cy * this.scale;
    this.persist();
  }

  visibleWorld(): AABB {
    const [x0, y1] = this.toWorld(0, 0);
    const [x1, y0] = this.toWorld(this.width, this.height);
    return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
  }

  bind(projectId: string): boolean {
    this.key = `rr.viewport.${projectId}`;
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return false;
      const v = JSON.parse(raw) as { scale: number; tx: number; ty: number };
      if (Number.isFinite(v.scale) && Number.isFinite(v.tx) && Number.isFinite(v.ty)) {
        this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
        this.tx = v.tx;
        this.ty = v.ty;
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  private persist(): void {
    if (!this.key) return;
    try {
      localStorage.setItem(this.key, JSON.stringify({ scale: this.scale, tx: this.tx, ty: this.ty }));
    } catch {
      /* ignore */
    }
  }
}
