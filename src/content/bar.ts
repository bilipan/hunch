import { type Band, BAND_STEP, DEFAULT_BAND } from "../shared/questions";
import { element } from "./element";

export interface BarHandlers {
  onQuery(query: string): void;
  onStep(dir: 1 | -1): void;
  onBand(band: Band): void;
  onClose(): void;
}

export interface Status {
  counter?: string;
  verdict?: { text: string; tone: "found" | "absent" | "busy" | "error" | "none" };
  meta?: string;
  progress?: { done: number; total: number };
}

// The two thumbs track integer percent, so 5% steps stay exact instead of drifting
// through float arithmetic the way 0.05 steps do.
const PERCENT = 100;

// Handle width lives here, not in the stylesheet, because the collision test below has
// to know it to decide whether the two handles are on top of each other. The token is
// written out from here so the two can't drift apart. Sized for the widest value, "1.00".
const HANDLE_PX = 38;

export class FindBar {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly counter: HTMLElement;
  private readonly verdict: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly bandFill: HTMLElement;
  private readonly bandRoot: HTMLElement;
  private readonly bandLo: HTMLInputElement;
  private readonly bandHi: HTMLInputElement;
  // The visible handles. A slider thumb pseudo-element can't hold content, and making it
  // solid made it cover the readout, so the inputs stay invisible interaction surfaces
  // and these carry both the grip and the number.
  private readonly handleLo: HTMLElement;
  private readonly handleHi: HTMLElement;
  private lifted: "lo" | "hi" = "hi";
  private last: Band = DEFAULT_BAND;

  constructor(handlers: BarHandlers) {
    this.input = element("input", {
      class: "hunch-input",
      type: "text",
      placeholder: "What are you looking for?",
      spellcheck: "false",
      autocomplete: "off",
    });
    this.counter = element("span", { class: "hunch-counter" });
    this.verdict = element("span", { class: "hunch-verdict" });
    this.meta = element("span", { class: "hunch-meta" });
    this.progress = element("div", { class: "hunch-progress-fill" });
    this.bandFill = element("div", { class: "hunch-band-fill" });
    this.handleLo = this.handle("hunch-handle-lo");
    this.handleHi = this.handle("hunch-handle-hi");
    const step = String(Math.round(BAND_STEP * PERCENT));
    this.bandLo = this.thumb("Minimum confidence", step);
    this.bandHi = this.thumb("Maximum confidence", step);
    this.bandRoot = element(
      "div",
      { class: "hunch-band", title: "Confidence band" },
      element("div", { class: "hunch-band-track" }, this.bandFill),
      this.bandLo,
      this.bandHi,
      this.handleLo,
      this.handleHi,
    );
    this.bandRoot.style.setProperty("--h-handle-w", `${HANDLE_PX}px`);
    const prev = element("button", { class: "hunch-nav", title: "Previous (Shift+Enter)" }, "▲");
    const next = element("button", { class: "hunch-nav", title: "Next (Enter)" }, "▼");
    const close = element("button", { class: "hunch-close", title: "Close (Esc)" }, "✕");
    this.root = element(
      "div",
      { class: "hunch-bar", role: "search" },
      this.input,
      this.bandRoot,
      this.counter,
      element("div", { class: "hunch-seg" }, prev, next),
      this.verdict,
      this.meta,
      close,
      element("div", { class: "hunch-progress" }, this.progress),
    );

    this.bandLo.value = String(Math.round(DEFAULT_BAND.lo * PERCENT));
    this.bandHi.value = String(Math.round(DEFAULT_BAND.hi * PERCENT));
    this.bandLo.addEventListener("input", () => this.commitBand(handlers.onBand));
    this.bandHi.addEventListener("input", () => this.commitBand(handlers.onBand));
    this.bandLo.addEventListener("pointerdown", () => this.lift(this.bandLo));
    this.bandHi.addEventListener("pointerdown", () => this.lift(this.bandHi));

    close.addEventListener("click", handlers.onClose);
    prev.addEventListener("click", () => handlers.onStep(-1));
    next.addEventListener("click", () => handlers.onStep(1));
    this.input.addEventListener("input", () => handlers.onQuery(this.input.value.trim()));
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") handlers.onClose();
      else if (e.key === "Enter") {
        e.preventDefault();
        handlers.onStep(e.shiftKey ? -1 : 1);
      }
    });
    this.paintBand(DEFAULT_BAND);
    // Narrowing the track can make two handles that were clear collide, without the band
    // itself changing. The handle positions are CSS-driven and follow automatically; the
    // collision class is the only thing that needs recomputing.
    new ResizeObserver(() => this.markCollision(this.last.lo, this.last.hi)).observe(this.bandRoot);
  }

  private thumb(label: string, step: string) {
    return element("input", {
      class: "hunch-band-thumb",
      type: "range",
      min: "0",
      max: String(PERCENT),
      step,
      "aria-label": label,
    });
  }

  private handle(className: string) {
    return element("span", { class: `hunch-handle ${className}` }, element("span", { class: "hunch-handle-num" }, "0.00"));
  }

  // The two inputs cover the whole track, so whichever is on top owns every overlap
  // between them. Raising the one being dragged keeps the other reachable again the
  // moment you let go — and the handles have to move with it or they stack wrong.
  private lift(input: HTMLInputElement) {
    this.lifted = input === this.bandLo ? "lo" : "hi";
    const lo = this.lifted === "lo";
    this.bandLo.style.zIndex = lo ? "2" : "1";
    this.bandHi.style.zIndex = lo ? "1" : "2";
    this.handleLo.style.zIndex = lo ? "2" : "1";
    this.handleHi.style.zIndex = lo ? "1" : "2";
  }

  // Keeps the thumbs a step apart instead of letting them cross and silently swap ends.
  private readBand(): Band {
    const step = Math.round(BAND_STEP * PERCENT);
    const percent = (input: HTMLInputElement) => clamp(Number(input.value), 0, PERCENT);
    let lo = percent(this.bandLo);
    let hi = percent(this.bandHi);
    if (lo > hi - step) lo = hi - step;
    if (hi < lo + step) hi = lo + step;
    return { lo: lo / PERCENT, hi: hi / PERCENT };
  }

  private commitBand(send: (band: Band) => void) {
    const band = this.readBand();
    this.paintBand(band);
    send(band);
  }

  private paintBand({ lo, hi }: Band) {
    this.bandLo.value = String(Math.round(lo * PERCENT));
    this.bandHi.value = String(Math.round(hi * PERCENT));
    // Half a handle in from each end, mirroring how the browser places the thumbs
    const inset = (fraction: number) => `calc(var(--h-handle-w) / 2 + (100% - var(--h-handle-w)) * ${fraction})`;
    this.bandFill.style.left = inset(lo);
    this.bandFill.style.right = inset(1 - hi);
    this.paintHandle(this.handleLo, lo, this.bandLo);
    this.paintHandle(this.handleHi, hi, this.bandHi);
    this.markCollision(lo, hi);
  }

  // Fixed-width handles cannot help overlapping once the band gets narrower than one of
  // them, and that is reachable: a step apart is 5%, which on a 210px track is under 10px
  // of travel against a 38px handle. Rather than forbid narrow bands — isolating the single
  // best hit is the whole point of the control — the handle that is currently underneath
  // drops its number and shows a dot instead. The one on top always stays readable.
  private markCollision(lo: number, hi: number) {
    this.last = { lo, hi };
    const width = this.bandRoot.offsetWidth;
    // Before the bar is in the document every measurement is zero, which would make the
    // travel near zero and report every band as collided. Leave the default alone.
    if (width === 0) return;
    const travel = width - HANDLE_PX;
    const centre = (value: number) => HANDLE_PX / 2 + travel * value;
    const collided = Math.abs(centre(hi) - centre(lo)) < HANDLE_PX;
    // Clear both, not just the one underneath: lift() can swap which handle is on top,
    // and the previously-buried one would otherwise keep a stale class and go blank too.
    this.handleLo.classList.remove("hunch-handle-collided");
    this.handleHi.classList.remove("hunch-handle-collided");
    if (!collided) return;
    (this.lifted === "hi" ? this.handleLo : this.handleHi).classList.add("hunch-handle-collided");
  }

  private paintHandle(handle: HTMLElement, value: number, input: HTMLInputElement) {
    // Two decimals, matching the score printed on each highlight — 0.86 there, 0.86 here.
    const text = value.toFixed(2);
    handle.style.setProperty("--v", String(value));
    const num = handle.querySelector(".hunch-handle-num");
    if (num) num.textContent = text;
    input.setAttribute("aria-valuetext", text);
  }

  focus() {
    this.input.focus();
    this.input.select();
  }

  set(status: Status) {
    if (status.counter !== undefined) this.counter.textContent = status.counter;
    if (status.meta !== undefined) this.meta.textContent = status.meta;
    if (status.verdict) {
      this.verdict.textContent = status.verdict.text;
      this.verdict.className = `hunch-verdict hunch-${status.verdict.tone}`;
    }
    if (status.progress) {
      const { done, total } = status.progress;
      this.progress.style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
      this.progress.parentElement!.classList.toggle("hunch-active", total > 0 && done < total);
    }
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
