/**
 * RAG Chunker — splits content into semantic chunks with token-precise counts.
 *
 * Uses js-tiktoken (cl100k_base) for 100% OpenAI-compatible token counts.
 * Fetches token ranks lazily on first call; subsequent calls reuse the cached encoder.
 *
 * Strategy:
 *   1. Split on double-newlines (paragraph boundaries) to stay semantically meaningful.
 *   2. Accumulate paragraphs until we hit chunkTokenLimit.
 *   3. On overflow, emit chunk and carry the last `overlapPct` % of tokens into the
 *      start of the next chunk (sliding window overlap).
 */

import { Tiktoken } from "js-tiktoken/lite";
import cl100k from "js-tiktoken/ranks/cl100k_base";

export interface RagChunk {
  index: number;
  content: string;
  tokenCount: number;
  charCount: number;
}

// Lazily initialized encoder singleton
let _encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!_encoder) {
    // js-tiktoken/lite constructor: Tiktoken(ranks, extendedSpecialTokens?)
    // The ranks object itself contains pat_str, special_tokens, bpe_ranks.
    _encoder = new Tiktoken(cl100k);
  }
  return _encoder;
}

/**
 * Count tokens in a string using the cl100k_base encoder.
 */
export function countTokens(text: string): number {
  const enc = getEncoder();
  return enc.encode(text).length;
}

/**
 * Chunk content into token-bounded semantic chunks.
 *
 * @param content       Raw text to chunk (markdown or HTML)
 * @param chunkTokens   Target tokens per chunk (default 1000)
 * @param overlapPct    Fraction of the chunk to overlap with next chunk (default 0.1 = 10%)
 */
export function chunkContent(
  content: string,
  chunkTokens = 1000,
  overlapPct = 0.1,
): RagChunk[] {
  const enc = getEncoder();

  // Split into paragraphs; filter empty strings
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0);

  const chunks: RagChunk[] = [];
  let currentParagraphs: string[] = [];
  let currentTokenCount = 0;
  const overlapTokens = Math.floor(chunkTokens * overlapPct);

  const emitChunk = (paras: string[]) => {
    const text = paras.join("\n\n");
    const tokens = enc.encode(text).length;
    chunks.push({
      index: chunks.length,
      content: text,
      tokenCount: tokens,
      charCount: text.length,
    });
  };

  /**
   * Given a list of paragraphs that form the end of a chunk,
   * return the tail paragraphs that together contain >= overlapTokens,
   * to carry into the start of the next chunk.
   */
  const buildOverlap = (paras: string[]): string[] => {
    if (overlapPct <= 0 || paras.length === 0) return [];
    const overlap: string[] = [];
    let overlapCount = 0;
    for (let i = paras.length - 1; i >= 0; i--) {
      const tokens = enc.encode(paras[i]).length;
      overlap.unshift(paras[i]);
      overlapCount += tokens;
      if (overlapCount >= overlapTokens) break;
    }
    return overlap;
  };

  for (const para of paragraphs) {
    const paraTokens = enc.encode(para).length;

    // If a single paragraph exceeds the chunk size, split it by sentences
    if (paraTokens > chunkTokens) {
      // Flush whatever we have
      if (currentParagraphs.length > 0) {
        emitChunk(currentParagraphs);
        currentParagraphs = buildOverlap(currentParagraphs);
        currentTokenCount = enc.encode(currentParagraphs.join("\n\n")).length;
      }
      // Hard-split the giant paragraph at sentence boundaries
      const sentences = para.split(/(?<=[.!?])\s+/);
      let sentenceBuf: string[] = [];
      let sentenceTokenCount = 0;
      for (const sentence of sentences) {
        const st = enc.encode(sentence).length;
        if (sentenceTokenCount + st > chunkTokens && sentenceBuf.length > 0) {
          const merged = sentenceBuf.join(" ");
          chunks.push({
            index: chunks.length,
            content: merged,
            tokenCount: enc.encode(merged).length,
            charCount: merged.length,
          });
          sentenceBuf = buildOverlap(sentenceBuf.map((s) => s)); // carry overlap sentences
          sentenceTokenCount = enc.encode(sentenceBuf.join(" ")).length;
        }
        sentenceBuf.push(sentence);
        sentenceTokenCount += st;
      }
      if (sentenceBuf.length > 0) {
        currentParagraphs = sentenceBuf;
        currentTokenCount = sentenceTokenCount;
      }
      continue;
    }

    if (currentTokenCount + paraTokens > chunkTokens && currentParagraphs.length > 0) {
      emitChunk(currentParagraphs);
      currentParagraphs = buildOverlap(currentParagraphs);
      currentTokenCount = enc.encode(currentParagraphs.join("\n\n")).length;
    }

    currentParagraphs.push(para);
    currentTokenCount += paraTokens;
  }

  // Flush remaining paragraphs
  if (currentParagraphs.length > 0) {
    emitChunk(currentParagraphs);
  }

  return chunks;
}
