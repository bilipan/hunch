import type { BlockId } from "./protocol";

export const MAX_CHUNK_CHARS = 10_000;
export const MAX_CHUNK_BLOCKS = 16;
export const MAX_BLOCK_CHARS = 1_500;
export const MIN_BLOCK_CHARS = 12;
export const MAX_CONCURRENT_REQUESTS = 4;

export const THRESHOLD = 0.4;

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
