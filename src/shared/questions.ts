import type { BlockId } from "./protocol";

export const MAX_CHUNK_CHARS = 10_000;
export const MAX_CHUNK_BLOCKS = 16;
export const MAX_BLOCK_CHARS = 1_500;
export const MIN_BLOCK_CHARS = 12;
export const MAX_CONCURRENT_REQUESTS = 4;

// A hit is anything scoring at least this much. Inside DEFAULT_BAND it is highlighted
// and reachable with ▲▼; outside it it only gets a faint wash.
export const PAINT_FLOOR = 0.2;
export const MIN_ALPHA = 0.15; // opacity of a hit sitting exactly on the band's lower edge
export const MAX_ALPHA = 0.75; // ...and on its upper edge
export const DIM_ALPHA = 0.06; // wash for everything outside the band

export interface Band {
  lo: number;
  hi: number;
}

export const DEFAULT_BAND: Band = { lo: 0.4, hi: 1 };

export const BAND_STEP = 0.05;

export const inBand = (p: number, band: Band) => p >= band.lo && p <= band.hi;

// Opacity is relative to the band, not to 0..1, so a band of [0.80, 0.90] still shows
// which hit is stronger instead of flattening them all to the same wash.
export function bandAlpha(p: number, band: Band) {
  const t = band.hi - band.lo < 1e-9 ? 1 : (p - band.lo) / (band.hi - band.lo);
  return MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * t;
}

interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

export function questionsFor(query: string, ids: readonly BlockId[]): Record<BlockId, NoulQuestion> {
  const block = (id: BlockId): NoulQuestion => ({
    type: "noul",
    instructions: `Is block \`${id}\` what a reader searching this page for "${query}" is looking for?`,
    criteria: {
      true: "The block contains, states, or is specifically about what the search is for; for a question, the block answers it",
      false: "The block is unrelated, or only shares a few words with the search without containing or addressing it",
    },
  });
  return Object.fromEntries(ids.map((id) => [id, block(id)]));
}
