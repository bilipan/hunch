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

export class FindBar {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly counter: HTMLElement;
  private readonly verdict: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly bandFill: HTMLElement;
  private readonly bandLabel: HTMLElement;
  private readonly bandLo: HTMLInputElement;
  private readonly bandHi: HTMLInputElement;

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
    this.bandLabel = element("span", { class: "hunch-band-label" });
    const step = String(Math.round(BAND_STEP * PERCENT));
    this.bandLo = this.thumb("Minimum confidence", step);
    this.bandHi = this.thumb("Maximum confidence", step);
    const prev = element("button", { class: "hunch-nav", title: "Previous (Shift+Enter)" }, "▲");
    const next = element("button", { class: "hunch-nav", title: "Next (Enter)" }, "▼");
    const close = element("button", { class: "hunch-close", title: "Close (Esc)" }, "✕");
    this.root = element(
      "div",
      { class: "hunch-bar", role: "search" },
      this.input,
      element(
        "div",
        { class: "hunch-band", title: "Confidence band" },
        element("div", { class: "hunch-band-track" }, this.bandFill),
        this.bandLo,
        this.bandHi,
        this.bandLabel,
      ),
      this.counter,
      prev,
      next,
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

  // The two inputs cover the whole track, so whichever is on top owns every overlap
  // between the thumbs — roughly a 9% window at the default thumb size. Raising the one
  // being dragged keeps the other reachable the moment you let go.
  private lift(input: HTMLInputElement) {
    this.bandLo.style.zIndex = input === this.bandLo ? "2" : "1";
    this.bandHi.style.zIndex = input === this.bandHi ? "2" : "1";
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
    // Half a thumb in from each end, mirroring how the browser places the thumbs
    const inset = (fraction: number) => `calc(var(--hunch-thumb) / 2 + (100% - var(--hunch-thumb)) * ${fraction})`;
    this.bandFill.style.left = inset(lo);
    this.bandFill.style.right = inset(1 - hi);
    this.bandLabel.textContent = `${Math.round(lo * PERCENT)}–${Math.round(hi * PERCENT)}%`;
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
