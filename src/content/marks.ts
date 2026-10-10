import type { Hit } from "./hits";

interface Mark {
  el: HTMLElement;
  hit: Hit;
}

export class ScrollMarks {
  readonly root: HTMLElement;
  private readonly viewport: HTMLElement;
  // Keyed by block element, not by Hit: every render rebuilds the Hit objects, but the
  // element behind a block never changes, so marks survive a progressive redraw.
  private readonly drawn = new Map<HTMLElement, Mark>();

  constructor(private readonly onPick: (hit: Hit) => void) {
    this.root = document.createElement("div");
    this.root.className = "hunch-marks";
    this.viewport = document.createElement("div");
    this.viewport.className = "hunch-viewport";
    this.root.appendChild(this.viewport);
    window.addEventListener("scroll", () => requestAnimationFrame(() => this.updateViewport()), { passive: true });
  }

  draw(hits: readonly Hit[], current: Hit | undefined) {
    const keep = new Set(hits.map((h) => h.el));
    for (const [el, mark] of this.drawn) {
      if (keep.has(el)) continue;
      mark.el.remove();
      this.drawn.delete(el);
    }
    const height = docHeight();
    for (const hit of hits) {
      let mark = this.drawn.get(hit.el);
      if (!mark) {
        const el = document.createElement("div");
        el.className = "hunch-mark";
        el.addEventListener("click", () => {
          const drawn = this.drawn.get(hit.el);
          if (drawn) this.onPick(drawn.hit);
        });
        mark = { el, hit };
        this.drawn.set(hit.el, mark);
        this.root.appendChild(el);
      }
      mark.hit = hit;
      const isCurrent = hit === current;
      mark.el.className = isCurrent ? "hunch-mark hunch-mark-current" : "hunch-mark";
      mark.el.style.top = `${((hit.el.getBoundingClientRect().top + window.scrollY) / height) * 100}%`;
      mark.el.style.opacity = isCurrent ? "1" : String(0.4 + 0.6 * hit.p);
      mark.el.title = `${Math.round(hit.p * 100)}%`;
    }
    this.updateViewport();
  }

  updateViewport() {
    const height = docHeight();
    this.viewport.style.top = `${(window.scrollY / height) * 100}%`;
    this.viewport.style.height = `${(window.innerHeight / height) * 100}%`;
  }
}

const docHeight = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1);