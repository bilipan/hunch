import type { BlockId } from "../shared/protocol";
import { THRESHOLD } from "../shared/questions";
import type { PageBlock } from "./blocks";

export interface Hit {
  el: HTMLElement;
  p: number;
}

export function rankHits(blocks: readonly PageBlock[], scores: Record<BlockId, number>): Hit[] {
  return blocks
    .map((b) => ({ el: b.el, p: scores[b.id] ?? 0 }))
    .filter((h) => h.p >= THRESHOLD)
    .sort((a, b) => b.p - a.p);
}

export function paintHits(hits: readonly Hit[]) {
  for (const { el, p } of hits) {
    // Scores arrive chunk by chunk, so the same hit shows up in every progress event
    // until the search ends. A block's score never changes once scored, which makes
    // skipping the already-painted ones enough to keep this incremental.
    if (el.classList.contains("hunch-hl")) continue;

    el.classList.add("hunch-hl");

    if (getComputedStyle(el).position === "static") el.classList.add("hunch-rel");

    el.style.setProperty("--hunch-alpha", (0.15 + 0.6 * ((p - THRESHOLD) / (1 - THRESHOLD))).toFixed(2));
    el.dataset.hunchP = p.toFixed(2);
  }
}

export function clearPaint() {
  for (const el of document.querySelectorAll<HTMLElement>(".hunch-hl")) {
    el.classList.remove("hunch-hl", "hunch-rel", "hunch-current");
    el.style.removeProperty("--hunch-alpha");
    delete el.dataset.hunchP;
  }
}

export function markCurrent(prev: Hit | undefined, next: Hit | undefined, { scroll = true } = {}) {
  prev?.el.classList.remove("hunch-current");
  next?.el.classList.add("hunch-current");
  if (scroll) next?.el.scrollIntoView({ block: "center", behavior: "smooth" });
}
