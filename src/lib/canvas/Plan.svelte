<script lang="ts">
  import { onMount } from 'svelte';
  import type { DocumentStore } from '../model/store.svelte';
  import type { Viewport } from './viewport.svelte';
  import type { CanvasUi, ToolName } from './ui.svelte';
  import type { Handle, Tool, ToolEvent } from './tools/types';
  import { SelectTool, selectionBox, groupCenter, interiorPoint } from './tools/select';
  import { PanTool, MeasureTool, ObjectTool, TextTool, WalkwayTool, measureReadout } from './tools/simple';
  import { footprint, pointInPolygon, rotatePoint, centerOf, dist, type Pt } from '../geom/transform';
  import { wallOutline, openingRect, swingArc, doubleSwing, insideSignFor, pointAlong, wallNormal, wallDir } from '../geom/walls';
  import { haloPolygon, haloIsEmpty, type HaloSpec } from '../geom/halo';
  import { formatLength } from '../geom/units';
  import { propsOf, type ObjectRow } from '../model/types';
  import { sceneBox, mergedBox, polyPoints, pointsToPath } from './scene';

  import type { Underlay } from '../supabase/settings';

  let {
    store,
    viewport,
    ui,
    canEdit,
    underlay = null,
    underlayUrl = '',
  }: { store: DocumentStore; viewport: Viewport; ui: CanvasUi; canEdit: boolean; underlay?: Underlay | null; underlayUrl?: string } = $props();

  const tools: Record<ToolName, Tool> = {
    select: new SelectTool(),
    pan: new PanTool(),
    measure: new MeasureTool(),
    object: new ObjectTool(),
    text: new TextTool(),
    walkway: new WalkwayTool(),
  };
  export function selectTool(): SelectTool {
    return tools.select as SelectTool;
  }

  let svg = $state<SVGSVGElement | null>(null);
  let cursorStyle = $state('default');
  const pointers = new Map<number, Pt>();
  let pinchStart: { d: number; scale: number; mid: Pt } | null = null;
  let tempPan: Pt | null = null;

  const ctx = $derived({ store, viewport, ui, canEdit });
  const activeTool = $derived(tools[ui.tool]);
  const scale = $derived(viewport.scale);
  const worldTransform = $derived(`matrix(${scale} 0 0 ${-scale} ${viewport.tx} ${viewport.ty})`);
  const showMinor = $derived(viewport.pxPerFt >= 24);
  const showLabels = $derived(viewport.pxPerFt >= 6);
  const visible = $derived(viewport.visibleWorld());
  const walls = $derived([...store.walls.values()]);
  const inside = $derived(interiorPoint(ctx));
  const objects = $derived(store.orderedObjects());
  const selected = $derived(store.selectedObjects());
  const selBox = $derived(selectionBox(selected, ui.preview));
  const fontPx = $derived(11 / scale);
  const handleSize = $derived(8 / scale);

  type HandlePos = { handle: Handle; at: Pt };
  const handles = $derived.by((): HandlePos[] => {
    if (selected.length === 0 || !canEdit) return [];
    if (selected.length === 1) {
      const o = selected[0];
      const b = mergedBox(o, ui.preview);
      const c = centerOf(b);
      const local = (lx: number, ly: number): Pt => rotatePoint([b.x + lx, b.y + ly], c, b.rot);
      const out: HandlePos[] = [{ handle: { kind: 'rotate' }, at: local(b.w / 2, b.d + 22 / scale) }];
      if (!propsOf(o).size_locked) {
        out.push(
          { handle: { kind: 'resize', corner: 'sw' }, at: local(0, 0) },
          { handle: { kind: 'resize', corner: 'se' }, at: local(b.w, 0) },
          { handle: { kind: 'resize', corner: 'ne' }, at: local(b.w, b.d) },
          { handle: { kind: 'resize', corner: 'nw' }, at: local(0, b.d) },
          { handle: { kind: 'resize', corner: 's' }, at: local(b.w / 2, 0) },
          { handle: { kind: 'resize', corner: 'e' }, at: local(b.w, b.d / 2) },
          { handle: { kind: 'resize', corner: 'n' }, at: local(b.w / 2, b.d) },
          { handle: { kind: 'resize', corner: 'w' }, at: local(0, b.d / 2) },
        );
      }
      return out;
    }
    const c = groupCenter(selected.map((o) => ({ ...o, ...mergedBox(o, ui.preview) })));
    const box = selBox!;
    return [{ handle: { kind: 'rotate' }, at: [c[0], box.maxY + 22 / scale] }];
  });

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const first = viewport.width === 0;
      viewport.width = r.width;
      viewport.height = r.height;
      if (first && !viewport.bind(store.projectId)) viewport.fitTo(sceneBox(store));
    });
    if (svg) ro.observe(svg);
    return () => ro.disconnect();
  });

  export function fit(): void {
    viewport.fitTo(sceneBox(store));
  }

  function screenOf(ev: PointerEvent | WheelEvent | MouseEvent): Pt {
    const r = svg!.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  function hitTest(world: Pt): string | null {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (!store.isInteractive(o)) continue;
      if (pointInPolygon(world, footprint(mergedBox(o, ui.preview)))) return o.id;
    }
    return null;
  }

  export function objectsAt(world: Pt): string[] {
    return objects.filter((o) => store.isInteractive(o) && pointInPolygon(world, footprint(mergedBox(o, ui.preview)))).map((o) => o.id);
  }

  function handleAt(screen: Pt): Handle | null {
    for (const h of handles) {
      const s = viewport.toScreen(...h.at);
      if (Math.hypot(s[0] - screen[0], s[1] - screen[1]) <= 8) return h.handle;
    }
    return null;
  }

  function toolEvent(ev: PointerEvent | MouseEvent, detail = 1): ToolEvent {
    const screen = screenOf(ev);
    const world = viewport.toWorld(...screen);
    const handle = ui.tool === 'select' ? handleAt(screen) : null;
    return { world, screen, shift: ev.shiftKey, alt: ev.altKey, ctrl: ev.ctrlKey || ev.metaKey, button: ev.button, hitId: handle ? null : hitTest(world), handle, detail };
  }

  function onPointerDown(ev: PointerEvent) {
    if (!svg) return;
    svg.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, screenOf(ev));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: dist(a, b), scale: viewport.scale, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      activeTool.cancel(ctx);
      return;
    }
    if (ev.button === 1 || ui.spaceHeld) {
      tempPan = screenOf(ev);
      ev.preventDefault();
      return;
    }
    if (ev.button === 2) return;
    activeTool.pointerDown(toolEvent(ev, ev.detail), ctx);
    cursorStyle = activeTool.cursor;
  }

  function onPointerMove(ev: PointerEvent) {
    const screen = screenOf(ev);
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, screen);
    ui.cursor = viewport.toWorld(...screen);
    if (pinchStart && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = dist(a, b);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      viewport.zoomAt(mid[0], mid[1], (pinchStart.scale * (d / pinchStart.d)) / viewport.scale);
      viewport.pan(mid[0] - pinchStart.mid[0], mid[1] - pinchStart.mid[1]);
      pinchStart.mid = mid;
      return;
    }
    if (tempPan) {
      viewport.pan(screen[0] - tempPan[0], screen[1] - tempPan[1]);
      tempPan = screen;
      return;
    }
    const e = toolEvent(ev);
    activeTool.pointerMove(e, ctx);
    cursorStyle = ui.spaceHeld ? 'grab' : activeTool.cursor;
    if (ui.tool === 'select' && pointers.size === 0) {
      ui.hoverId = e.hitId;
      ui.hoverAt = [ev.clientX, ev.clientY];
    } else if (ui.hoverId) ui.hoverId = null;
  }

  function onPointerUp(ev: PointerEvent) {
    pointers.delete(ev.pointerId);
    if (pinchStart) {
      if (pointers.size < 2) pinchStart = null;
      return;
    }
    if (tempPan) {
      tempPan = null;
      return;
    }
    if (ev.button === 2) return;
    activeTool.pointerUp(toolEvent(ev, ev.detail), ctx);
    cursorStyle = activeTool.cursor;
  }

  function onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const [sx, sy] = screenOf(ev);
    if (ev.ctrlKey || !ev.shiftKey) viewport.zoomAt(sx, sy, Math.exp(-ev.deltaY * 0.0015));
    else viewport.pan(-ev.deltaY, 0);
  }

  function onContextMenu(ev: MouseEvent) {
    ev.preventDefault();
    const e = toolEvent(ev);
    if (e.hitId && !store.selection.has(e.hitId)) store.select([e.hitId]);
    if (e.hitId || store.selection.size > 0) ui.contextMenu = { x: ev.clientX, y: ev.clientY };
  }

  function onDblClick(ev: MouseEvent) {
    if (ui.tool !== 'select') return;
    const e = toolEvent(ev, 2);
    if (!e.hitId) fit();
  }

  function layerColor(layerId: string): string {
    return store.layers.get(layerId)?.color ?? '#888';
  }

  function textFlip(rot: number): string {
    const upright = ((rot % 360) + 360) % 360;
    return upright > 90 && upright < 270 ? 'rotate(180) scale(1,-1)' : 'scale(1,-1)';
  }

  function openingSymbol(o: import('../model/types').OpeningRow) {
    const w = store.walls.get(o.wall_id);
    if (!w) return null;
    const sign = insideSignFor(w, inside);
    const geom = { offset: o.offset, width: o.width, swing: o.swing, hinge: o.hinge };
    const rect = openingRect(w, geom);
    const a = pointAlong(w, o.offset);
    const b = pointAlong(w, o.offset + o.width);
    const [nx, ny] = wallNormal(w);
    const q = w.thickness / 4;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const angle = (Math.atan2(wallDir(w)[1], wallDir(w)[0]) * 180) / Math.PI;
    return {
      rect,
      a,
      b,
      nx,
      ny,
      q,
      mid,
      angle,
      sign,
      arcs: o.kind === 'door' ? [swingArc(w, geom, sign)] : o.kind === 'double_door' ? doubleSwing(w, geom, sign) : [],
      demo: store.demoWalls.has(w.id),
    };
  }
</script>

<svg
  bind:this={svg}
  class="plan"
  data-test="plan"
  style:cursor={cursorStyle}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  oncontextmenu={onContextMenu}
  ondblclick={onDblClick}
  role="application"
  aria-label="Plan view"
>
  <defs>
    <pattern id="grid-1" width="1" height="1" patternUnits="userSpaceOnUse">
      <path d="M 1 0 L 0 0 0 1" fill="none" stroke="var(--paper-line)" stroke-width={0.6 / scale} />
    </pattern>
    <pattern id="grid-12" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M 12 0 L 0 0 0 12" fill="none" stroke="var(--paper-line)" stroke-width={1 / scale} />
    </pattern>
    <pattern id="grid-60" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="var(--paper-line-major)" stroke-width={1.2 / scale} />
    </pattern>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" stroke-width={1 / scale} />
    </pattern>
  </defs>

  <g transform={worldTransform}>
    {#if ui.grid}
      {#if showMinor}
        <rect x={visible.minX} y={visible.minY} width={visible.maxX - visible.minX} height={visible.maxY - visible.minY} fill="url(#grid-1)" />
      {/if}
      <rect x={visible.minX} y={visible.minY} width={visible.maxX - visible.minX} height={visible.maxY - visible.minY} fill="url(#grid-12)" />
      <rect x={visible.minX} y={visible.minY} width={visible.maxX - visible.minX} height={visible.maxY - visible.minY} fill="url(#grid-60)" />
    {/if}

    {#if underlay && underlay.visible && underlayUrl}
      {@const h = underlay.width * underlay.aspect}
      <image
        data-test="underlay"
        href={underlayUrl}
        x="0"
        y="0"
        width={underlay.width}
        height={h}
        preserveAspectRatio="none"
        opacity={underlay.opacity}
        transform={`translate(${underlay.x} ${underlay.y}) rotate(${underlay.rotation}) translate(0 ${h}) scale(1 -1)`}
        style="pointer-events:none"
      />
    {/if}

    {#if store.slab}
      {@const flooring = [...store.layers.values()].find((l) => l.key === 'flooring')}
      {#if flooring && store.isLayerVisible(flooring.id)}
        <polygon
          data-test="slab"
          points={polyPoints(store.slab.polygon as [number, number][])}
          fill={flooring.color}
          fill-opacity={0.04 * store.layerOpacity(flooring.id)}
          stroke={flooring.color}
          stroke-opacity={0.5 * store.layerOpacity(flooring.id)}
          stroke-dasharray="6 4"
          vector-effect="non-scaling-stroke"
        />
      {/if}
    {/if}

    {#each walls as w (w.id)}
      {@const demo = store.demoWalls.has(w.id)}
      {@const wallsLayer = w.layer_id ? store.layers.get(w.layer_id) : null}
      {#if !wallsLayer || store.isLayerVisible(wallsLayer.id)}
        <polygon
          data-test="wall"
          data-id={w.id}
          points={polyPoints(wallOutline(w))}
          fill={demo ? 'none' : 'var(--ink)'}
          fill-opacity={demo ? 0 : 0.82}
          stroke="var(--ink)"
          stroke-width={demo ? 1 : 1.2}
          stroke-dasharray={demo ? '6 4' : undefined}
          vector-effect="non-scaling-stroke"
        />
      {/if}
    {/each}

    {#each [...store.openings.values()] as o (o.id)}
      {@const s = openingSymbol(o)}
      {#if s}
        <g data-test="opening" data-kind={o.kind} data-id={o.id} opacity={s.demo ? 0.4 : 1}>
          <polygon points={polyPoints(s.rect)} fill="var(--paper)" stroke="none" />
          {#if o.kind === 'window'}
            <line x1={s.a[0] + s.nx * s.q} y1={s.a[1] + s.ny * s.q} x2={s.b[0] + s.nx * s.q} y2={s.b[1] + s.ny * s.q} stroke="var(--ink)" vector-effect="non-scaling-stroke" />
            <line x1={s.a[0] - s.nx * s.q} y1={s.a[1] - s.ny * s.q} x2={s.b[0] - s.nx * s.q} y2={s.b[1] - s.ny * s.q} stroke="var(--ink)" vector-effect="non-scaling-stroke" />
            <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="var(--ink)" stroke-width="0.6" vector-effect="non-scaling-stroke" />
          {:else if o.kind === 'slider'}
            <line x1={s.a[0] + s.nx * s.q} y1={s.a[1] + s.ny * s.q} x2={s.mid[0] + s.nx * s.q} y2={s.mid[1] + s.ny * s.q} stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
            <line x1={s.mid[0] - s.nx * s.q} y1={s.mid[1] - s.ny * s.q} x2={s.b[0] - s.nx * s.q} y2={s.b[1] - s.ny * s.q} stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          {:else if o.kind === 'fireplace'}
            <polygon points={polyPoints(s.rect)} fill="url(#hatch)" stroke="var(--ink)" vector-effect="non-scaling-stroke" />
          {:else if o.kind === 'cased_opening'}
            <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="var(--ink-3)" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
          {:else}
            {#each s.arcs as arc}
              <line x1={arc.leaf[0][0]} y1={arc.leaf[0][1]} x2={arc.leaf[1][0]} y2={arc.leaf[1][1]} stroke="var(--ink)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
              <path d={arc.path} fill="none" stroke="var(--ink-3)" stroke-width="0.8" vector-effect="non-scaling-stroke" />
            {/each}
          {/if}
          {#if showLabels && o.label}
            <text
              transform={`translate(${s.mid[0] + s.nx * s.sign * (o.kind === 'fireplace' ? 14 : 8) / scale * scale} ${s.mid[1] + s.ny * s.sign * 8}) rotate(${s.angle}) ${textFlip(s.angle)}`}
              font-size={fontPx * 0.85}
              fill="var(--ink-3)"
              text-anchor="middle"
              font-family="var(--font-mono)"
            >{o.label}</text>
          {/if}
        </g>
      {/if}
    {/each}

    {#each objects as o (o.id)}
      {@const layer = store.layers.get(o.layer_id)}
      {#if layer && store.isLayerVisible(layer.id)}
        {@const b = mergedBox(o, ui.preview)}
        {@const props = propsOf(o)}
        {@const color = layer.color}
        {@const isSel = store.selection.has(o.id)}
        <g
          class="obj"
          data-test="object"
          data-id={o.id}
          data-x={b.x}
          data-y={b.y}
          data-rot={b.rot}
          opacity={store.layerOpacity(layer.id)}
          transform={`translate(${b.x + b.w / 2} ${b.y + b.d / 2}) rotate(${b.rot}) translate(${-b.w / 2} ${-b.d / 2})`}
        >
          {#if props.kind === 'text'}
            <text transform={`translate(0 0) ${textFlip(b.rot)}`} font-size={fontPx * 1.1} fill={color} font-family="var(--font-ui)" dominant-baseline="hanging" y={-b.d}>{props.text ?? o.name}</text>
          {:else if props.kind === 'walkway'}
            <rect width={b.w} height={b.d} fill={color} fill-opacity="0.05" stroke={color} stroke-dasharray="8 4" vector-effect="non-scaling-stroke" />
            {#if showLabels}
              <text transform={`translate(${b.w / 2} ${b.d / 2}) ${textFlip(b.rot)}`} font-size={fontPx * 0.85} fill={color} text-anchor="middle" dominant-baseline="middle" font-family="var(--font-mono)">{o.name} · {formatLength(Math.min(b.w, b.d))} clear</text>
            {/if}
          {:else if props.kind === 'dimension' && props.points}
            <path d={pointsToPath(props.points, props.closed)} fill="none" stroke={color} stroke-width="1" vector-effect="non-scaling-stroke" />
            {#if showLabels}
              <text transform={`translate(${props.points[0][0]} ${props.points[0][1]}) ${textFlip(0)}`} font-size={fontPx * 0.85} fill={color} font-family="var(--font-mono)">{measureReadout(props.points, null, !!props.closed)}</text>
            {/if}
          {:else}
            <rect width={b.w} height={b.d} fill={color} fill-opacity={isSel ? 0.22 : 0.12} stroke={color} stroke-width={o.locked ? 0.8 : 1.2} stroke-dasharray={o.locked ? '3 2' : undefined} vector-effect="non-scaling-stroke" />
            {#if o.mount === 'wall' || o.mount === 'recessed'}
              <line x1="0" y1="0" x2={b.w} y2="0" stroke={color} stroke-width="3" vector-effect="non-scaling-stroke" />
            {:else if o.mount === 'ceiling'}
              <line x1="0" y1="0" x2={b.w} y2={b.d} stroke={color} stroke-width="0.6" vector-effect="non-scaling-stroke" />
              <line x1="0" y1={b.d} x2={b.w} y2="0" stroke={color} stroke-width="0.6" vector-effect="non-scaling-stroke" />
            {/if}
            {#if showLabels && b.w * scale > 28}
              <text transform={`translate(${b.w / 2} ${b.d / 2}) ${textFlip(b.rot)}`} font-size={fontPx} fill="var(--ink)" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-ui)">{o.name}</text>
            {/if}
          {/if}
        </g>
      {/if}
    {/each}

    {#if ui.halos || selected.length > 0}
      {#each objects as o (o.id + '-halo')}
        {@const halo = o.halo as HaloSpec | null}
        {#if !haloIsEmpty(halo) && store.isLayerVisible(o.layer_id) && (ui.halos || store.selection.has(o.id))}
          <polygon
            data-test="halo"
            points={polyPoints(haloPolygon(mergedBox(o, ui.preview), halo!))}
            fill={layerColor(o.layer_id)}
            fill-opacity="0.06"
            stroke={layerColor(o.layer_id)}
            stroke-dasharray="5 4"
            stroke-opacity="0.7"
            vector-effect="non-scaling-stroke"
          />
        {/if}
      {/each}
    {/if}

    {#each selected as o (o.id + '-sel')}
      <polygon points={polyPoints(footprint(mergedBox(o, ui.preview)))} fill="none" stroke="var(--blueprint)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    {/each}
    {#if selBox && selected.length > 1}
      <rect x={selBox.minX} y={selBox.minY} width={selBox.maxX - selBox.minX} height={selBox.maxY - selBox.minY} fill="none" stroke="var(--blueprint)" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
    {/if}
    {#each handles as h (JSON.stringify(h.handle))}
      {#if h.handle.kind === 'rotate'}
        <circle cx={h.at[0]} cy={h.at[1]} r={handleSize / 2} fill="var(--surface)" stroke="var(--blueprint)" vector-effect="non-scaling-stroke" />
      {:else}
        <rect x={h.at[0] - handleSize / 2} y={h.at[1] - handleSize / 2} width={handleSize} height={handleSize} fill="var(--surface)" stroke="var(--blueprint)" vector-effect="non-scaling-stroke" />
      {/if}
    {/each}

    {#if ui.marquee}
      <rect
        data-test="marquee"
        x={ui.marquee.minX}
        y={ui.marquee.minY}
        width={ui.marquee.maxX - ui.marquee.minX}
        height={ui.marquee.maxY - ui.marquee.minY}
        fill="var(--blueprint)"
        fill-opacity="0.08"
        stroke="var(--blueprint)"
        stroke-dasharray={ui.marqueeMode === 'enclose' ? undefined : '4 3'}
        vector-effect="non-scaling-stroke"
      />
    {/if}

    {#each ui.guides as g}
      {#if g.axis === 'x'}
        <line x1={g.at} y1={visible.minY} x2={g.at} y2={visible.maxY} stroke="var(--danger)" stroke-width="1" vector-effect="non-scaling-stroke" />
      {:else}
        <line x1={visible.minX} y1={g.at} x2={visible.maxX} y2={g.at} stroke="var(--danger)" stroke-width="1" vector-effect="non-scaling-stroke" />
      {/if}
    {/each}

    {#if ui.pendingBox}
      <rect x={ui.pendingBox.x} y={ui.pendingBox.y} width={ui.pendingBox.w} height={ui.pendingBox.d} fill="var(--blueprint)" fill-opacity="0.1" stroke="var(--blueprint)" vector-effect="non-scaling-stroke" />
    {/if}

    {#if ui.measure.points.length > 0}
      {@const pts = ui.measure.cursor ? [...ui.measure.points, ui.measure.cursor] : ui.measure.points}
      <path d={pointsToPath(pts, ui.measure.closed)} fill={ui.measure.closed ? 'var(--blueprint)' : 'none'} fill-opacity="0.08" stroke="var(--blueprint)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
      {#each ui.measure.points as p}
        <circle cx={p[0]} cy={p[1]} r={3 / scale} fill="var(--blueprint)" />
      {/each}
    {/if}
  </g>
</svg>

<style>
  .plan {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    user-select: none;
  }
  .plan text {
    pointer-events: none;
  }
</style>
