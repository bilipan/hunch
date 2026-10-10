import browser from "webextension-polyfill";
import { FindBar, type Status } from "./content/bar";
import { extractBlocks, type PageBlock } from "./content/blocks";
import { clearPaint, type Hit, markCurrent, paintBand, rankHits } from "./content/hits";
import { ScrollMarks } from "./content/marks";
import { type Band, DEFAULT_BAND } from "./shared/questions";
import { type BlockId, type Progress, SEARCH_PORT, type Search, type SearchEvent, type TabMessage } from "./shared/protocol";

const DEBOUNCE_MS = 300;
const MIN_QUERY = 3;

type Verdict = NonNullable<Status["verdict"]>;

class Hunch {
  // The UI lives in a shadow root so page CSS (YouTube and others) can't change it
  private readonly host = document.createElement("hunch-ui");
  private readonly bar = new FindBar({
    onQuery: (q) => this.queueSearch(q),
    onStep: (dir) => this.step(dir),
    onBand: (band) => this.setBand(band),
    onClose: () => this.close(),
  });
  private readonly marks = new ScrollMarks((hit) => {
    this.pinned = true;
    this.goTo(hit);
  });

  private blocks: PageBlock[] = [];
  private hits: Hit[] = [];
  private scores: Record<BlockId, number> = {};
  private last: Progress | undefined;
  // Survives close/open for the tab, so you don't re-drag it on every search
  private band: Band = { ...DEFAULT_BAND };
  private currentEl: HTMLElement | undefined;
  // Set once the reader picks a hit themselves, so incoming chunks stop yanking them
  private pinned = false;
  private port: browser.Runtime.Port | undefined;
  private debounce: number | undefined;

  constructor() {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = browser.runtime.getURL("ui.css");
    this.host.attachShadow({ mode: "open" }).append(style, this.bar.root, this.marks.root);
    document.documentElement.appendChild(this.host);
    window.addEventListener("resize", () => this.marks.draw(this.hits, this.current));
    // The bar wraps to a different height on narrow screens, so the rail's bottom edge
    // follows it rather than trusting a hardcoded offset.
    new ResizeObserver(() => {
      this.host.style.setProperty("--hunch-bar-h", `${this.bar.root.offsetHeight}px`);
    }).observe(this.bar.root);
  }

  get isOpen() {
    return this.host.classList.contains("hunch-open");
  }

  open() {
    this.blocks = extractBlocks();
    this.host.classList.add("hunch-open");
    this.reset();
    this.bar.focus();
  }

  close() {
    this.host.classList.remove("hunch-open");
    this.abort();
    this.reset();
  }

  private reset() {
    clearPaint();
    this.hits = [];
    this.scores = {};
    this.last = undefined;
    this.currentEl = undefined;
    this.pinned = false;
    this.marks.draw([], undefined);
    this.bar.set({
      counter: "",
      meta: `${this.blocks.length} blocks`,
      verdict: { text: "", tone: "none" },
      progress: { done: 0, total: 0 },
    });
  }

  private queueSearch(query: string) {
    window.clearTimeout(this.debounce);
    this.abort();
    if (query.length < MIN_QUERY) return this.reset();
    this.debounce = window.setTimeout(() => this.search(query), DEBOUNCE_MS);
  }

  private search(query: string) {
    this.reset();
    this.bar.set({ verdict: { text: "searching…", tone: "busy" }, progress: { done: 0, total: 1 } });
    const req: Search = {
      url: location.href,
      title: document.title,
      blocks: this.blocks.map(({ id, text }) => ({ id, text })),
      query,
    };
    const port = browser.runtime.connect({ name: SEARCH_PORT });
    port.onMessage.addListener((e: unknown) => {
      if (this.port === port) this.render(e as SearchEvent);
    });
    port.postMessage(req);
    this.port = port;
  }

  private abort() {
    this.port?.disconnect();
    this.port = undefined;
  }

  private render(e: SearchEvent) {
    if (e.type === "failure") {
      this.last = undefined;
      this.bar.set({ verdict: { text: e.message, tone: "error" }, progress: { done: 0, total: 0 } });
      return;
    }
    this.scores = e.scores;
    this.last = e;
    this.refilter();
  }

  private setBand(band: Band) {
    this.band = band;
    this.refilter();
  }

  // The single place that turns scores plus a band into a painted page. Runs on every
  // progress event and on every thumb movement, so the two paths cannot drift.
  private refilter() {
    const ranked = rankHits(this.blocks, this.scores, this.band);
    paintBand(ranked, this.band);
    this.hits = ranked.hits;

    if (this.currentEl && !ranked.hits.some((h) => h.el === this.currentEl)) {
      this.currentEl = undefined; // the reader's hit just got filtered out
      this.pinned = false;
    }
    const best = this.hits[0];
    if (best && !this.pinned) {
      // Never scroll on our own: highlights land wherever they sit on the page and the
      // reader stays put. ▲▼ or a click on the rail is the only thing that moves them.
      this.moveTo(best, false);
    } else {
      this.marks.draw(this.hits, this.current);
    }
    this.bar.set(this.status());
  }

  private status(): Status {
    const p = this.last;
    const finished = !p || p.done === p.total;
    const best = this.hits[0];
    const n = this.hits.length;
    const verdict: Verdict = best
      ? { text: `on this page · ${Math.round(best.p * 100)}%`, tone: finished ? "found" : "busy" }
      : { text: finished ? "not on this page" : "searching…", tone: finished ? "absent" : "busy" };
    return {
      verdict,
      // undefined leaves whatever reset() put there alone, so nudging the slider before
      // searching doesn't replace the block count with "0 hits"
      meta: p ? `${n} hit${n === 1 ? "" : "s"} · ${p.ms} ms · ${p.total} req${p.failed ? ` · ${p.failed} failed` : ""}` : undefined,
      progress: { done: p?.done ?? 0, total: p?.total ?? 0 },
      counter: this.counterText(),
    };
  }

  private get current(): Hit | undefined {
    return this.currentEl ? this.hits.find((h) => h.el === this.currentEl) : undefined;
  }

  private counterText() {
    const i = this.currentIndex();
    if (i < 0) return this.hits.length ? "" : "0 hits";
    return `${i + 1} of ${this.hits.length} · ${Math.round(this.hits[i]!.p * 100)}%`;
  }

  private currentIndex() {
    return this.currentEl ? this.hits.findIndex((h) => h.el === this.currentEl) : -1;
  }

  private step(dir: 1 | -1) {
    if (!this.hits.length) return;
    this.pinned = true;
    const i = this.currentIndex();
    this.goTo(this.hits[(i + dir + this.hits.length) % this.hits.length]!);
  }

  private goTo(hit: Hit) {
    this.moveTo(hit, true);
  }

  private moveTo(hit: Hit, scroll: boolean) {
    markCurrent(this.current, hit, { scroll });
    this.currentEl = hit.el;
    this.bar.set({ counter: this.counterText() });
    this.marks.draw(this.hits, hit);
  }
}

declare global {
  interface Window {
    __hunchLoaded?: boolean;
  }
}

if (!window.__hunchLoaded) {
  window.__hunchLoaded = true;
  let hunch: Hunch | undefined;
  const toggle = () => {
    hunch ??= new Hunch();
    hunch.isOpen ? hunch.close() : hunch.open();
  };
  browser.runtime.onMessage.addListener((msg: unknown) => {
    switch ((msg as TabMessage).type) {
      case "ping":
        return Promise.resolve(true);
      case "toggle":
        toggle();
    }
  });
}
