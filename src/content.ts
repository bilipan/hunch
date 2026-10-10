import browser from "webextension-polyfill";
import { FindBar } from "./content/bar";
import { extractBlocks, type PageBlock } from "./content/blocks";
import { clearPaint, type Hit, markCurrent, paint, rankHits } from "./content/hits";
import { ScrollMarks } from "./content/marks";
import { type Progress, SEARCH_PORT, type Search, type SearchEvent, type TabMessage } from "./shared/protocol";

const DEBOUNCE_MS = 300;
const MIN_QUERY = 3;

class Hunch {
  // The UI lives in a shadow root so page CSS (YouTube and others) can't change it
  private readonly host = document.createElement("hunch-ui");
  private readonly bar = new FindBar({
    onQuery: (q) => this.queueSearch(q),
    onStep: (dir) => this.step(dir),
    onClose: () => this.close(),
  });
  private readonly marks = new ScrollMarks((hit) => this.goTo(hit));

  private blocks: PageBlock[] = [];
  private hits: Hit[] = [];
  private current: Hit | undefined;
  private port: browser.Runtime.Port | undefined;
  private debounce: number | undefined;

  constructor() {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = browser.runtime.getURL("ui.css");
    this.host.attachShadow({ mode: "open" }).append(style, this.bar.root, this.marks.root);
    document.documentElement.appendChild(this.host);
    window.addEventListener("resize", () => this.marks.draw(this.hits, this.current));
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
    this.current = undefined;
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
    this.current = undefined;
    this.bar.set({ verdict: { text: "thinking…", tone: "busy" }, progress: { done: 0, total: 1 } });
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
      this.bar.set({ verdict: { text: e.message, tone: "error" }, progress: { done: 0, total: 0 } });
      return;
    }
    const finished = e.done === e.total;
    if (!finished) {
      // While search is in progress, only update the status bar — don't repaint highlights
      this.bar.set({ ...this.status(e), verdict: { text: "thinking…", tone: "busy" } });
      return;
    }
    // Final render: paint highlights and marks once
    this.hits = rankHits(this.blocks, e.scores);
    paint(this.hits);
    if (this.hits[0]) this.goTo(this.hits[0]);
    else this.current = undefined;
    this.bar.set(this.status(e));
    this.marks.draw(this.hits, this.current);
  }

  private status(p: Progress) {
    const finished = p.done === p.total;
    const best = this.hits[0];
    const n = this.hits.length;
    return {
      verdict: {
        text: best ? `on this page · ${Math.round(best.p * 100)}%` : "not on this page",
        tone: finished ? (best ? "found" : "absent") : "busy",
      },
      meta: `${n} hit${n === 1 ? "" : "s"} · ${p.ms} ms · ${p.total} req${p.failed ? ` · ${p.failed} failed` : ""}`,
      progress: { done: p.done, total: p.total },
      counter: this.counterText(),
    } as const;
  }

  private counterText() {
    if (!this.current) return this.hits.length ? "" : "0 hits";
    return `${this.hits.indexOf(this.current) + 1} of ${this.hits.length} · ${Math.round(this.current.p * 100)}%`;
  }

  private step(dir: 1 | -1) {
    if (!this.hits.length) return;
    const i = this.current ? this.hits.indexOf(this.current) : -1;
    this.goTo(this.hits[(i + dir + this.hits.length) % this.hits.length]!);
  }

  private goTo(hit: Hit) {
    markCurrent(this.current, hit);
    this.current = hit;
    this.bar.set({ counter: this.counterText() });
    this.marks.draw(this.hits, this.current);
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
