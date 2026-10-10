import { type Block, type BlockId, type Progress, pageText, type Search } from "../shared/protocol";
import { MAX_CHUNK_BLOCKS, MAX_CHUNK_CHARS, MAX_CONCURRENT_REQUESTS, questionsFor } from "../shared/questions";
import type { Settings } from "../shared/settings";

const API_URL = "https://tokendance.space/gateway/typesafe/v1/systemone";

async function systemOne(
  state: Record<string, unknown>,
  questions: Record<string, unknown>,
  model: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Record<string, { noul: number }>> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state, questions, model }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.answers as Record<string, { noul: number }>;
}

export async function answer(
  req: Search,
  settings: Settings,
  signal: AbortSignal,
  emit: (p: Progress) => void,
): Promise<void> {
  const chunks = chunkByBudget(req.blocks);

  const started = performance.now();
  const scores: Record<BlockId, number> = {};
  let done = 0;
  let failed = 0;
  const report = () =>
    emit({
      type: "progress",
      scores: { ...scores },
      done,
      total: chunks.length,
      failed,
      ms: Math.round(performance.now() - started),
    });

  if (chunks.length === 0) return report();

  await parallel(chunks, MAX_CONCURRENT_REQUESTS, signal, async (blocks) => {
    try {
      const answers = await systemOne(
        { url: req.url, title: req.title, page_text: pageText(blocks) },
        questionsFor(
          req.query,
          blocks.map((b) => b.id),
        ),
        settings.model,
        settings.apiKey,
        signal,
      );
      for (const [id, a] of Object.entries(answers)) scores[id as BlockId] = a.noul;
    } catch (err) {
      if (signal.aborted) return;
      console.error("[hunch] chunk failed:", err);
      failed++;
    }
    done++;
    report();
  });
}

async function parallel<T>(items: T[], limit: number, signal: AbortSignal, work: (item: T) => Promise<void>) {
  let index = 0;
  const worker = async () => {
    while (index < items.length && !signal.aborted) await work(items[index++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function chunkByBudget(blocks: Block[]): Block[][] {
  const out: Block[][] = [];
  let current: Block[] = [];
  let chars = 0;
  for (const b of blocks) {
    if (chars + b.text.length > MAX_CHUNK_CHARS || current.length >= MAX_CHUNK_BLOCKS) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(b);
    chars += b.text.length;
  }
  if (current.length) out.push(current);
  return out;
}
