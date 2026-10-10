import type { BlockId } from "../shared/protocol";
import { bandAlpha, type Band, DIM_ALPHA, inBand, PAINT_FLOOR } from "../shared/questions";
import type { PageBlock } from "./blocks";

export interface Hit {
  el: HTMLElement;
  p: number;
}

export interface Ranked {
  /** Inside the band: highlighted at full strength and reachable with ▲▼ */
  hits: Hit[];
  /** Scored but outside the band: faint wash, no badge, no navigation */
  dim: Hit[];
}

const PAINTED = ".hunch-hl, .hunch-dim";

export function rankHits(blocks: readonly PageBlock[], scores: Record<BlockId, number>, band: Band): Ranked {
  const hits: Hit[] = [];
  const dim: Hit[] = [];
  for (const b of blocks) {
    const p = scores[b.id];
    if (p === undefined || p < PAINT_FLOOR) continue;
    (inBand(p, band) ? hits : dim).push({ el: b.el, p });
  }
  const byConfidence = (a: Hit, b: Hit) => b.p - a.p;
  hits.sort(byConfidence);
  dim.sort(byConfidence);
  return { hits, dim };
}

// Reconciles the page against the band rather than only adding to it: dragging a thumb
// down has to un-paint what fell out, dragging it up has to paint what came back in.
// Opacity is stable within a fixed band — a block's score is final the moment it lands —
// so re-applying it across progress events does not retrigger the CSS transition.
export function paintBand(ranked: Ranked, band: Band) {
  const wanted = new Map<HTMLElement, Hit>();
  for (const hit of [...ranked.hits, ...ranked.dim]) wanted.set(hit.el, hit);

  for (const el of document.querySelectorAll<HTMLElement>(PAINTED)) {
    if (!wanted.has(el)) unpaint(el);
  }
  for (const [el, hit] of wanted) {
    const strong = inBand(hit.p, band);
    el.classList.toggle("hunch-hl", strong);
    el.classList.toggle("hunch-dim", !strong);
    el.style.setProperty("--hunch-alpha", (strong ? bandAlpha(hit.p, band) : DIM_ALPHA).toFixed(2));
    if (!strong) {
      el.classList.remove("hunch-rel", "hunch-current");
      delete el.dataset.hunchP;
    } else {
      if (getComputedStyle(el).position === "static") el.classList.add("hunch-rel");
      el.dataset.hunchP = hit.p.toFixed(2);
    }
  }
}

function unpaint(el: HTMLElement) {
  el.classList.remove("hunch-hl", "hunch-rel", "hunch-current", "hunch-dim");
  el.style.removeProperty("--hunch-alpha");
  delete el.dataset.hunchP;
}

export function clearPaint() {
  for (const el of document.querySelectorAll<HTMLElement>(PAINTED)) unpaint(el);
}

export function markCurrent(prev: Hit | undefined, next: Hit | undefined, { scroll = true } = {}) {
  prev?.el.classList.remove("hunch-current");
  next?.el.classList.add("hunch-current");
  if (scroll) next?.el.scrollIntoView({ block: "center", behavior: "smooth" });
}