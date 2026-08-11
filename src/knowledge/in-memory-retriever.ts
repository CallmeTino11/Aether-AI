/**
 * Aether AI — Knowledge: In-Memory Keyword Retriever
 *
 * A real, working `KnowledgeRetriever` with zero infrastructure dependencies.
 * Purpose is deliberate: it lets the Receptionist engine be built and tested
 * end-to-end today, and it is the reference implementation the future
 * pgvector/embedding retriever must behave like.
 *
 * Scoring is TF-weighted term overlap with a title bonus — crude but honest,
 * and good enough for the small curated knowledge sets a small business
 * uploads (services, hours, pricing, FAQs).
 */

import type {
  KnowledgeChunk,
  KnowledgeQuery,
  KnowledgeRetriever,
  RetrievedKnowledge,
} from "../domain/knowledge.js";

/** Words carrying no retrieval signal; excluded so "what are your hours" matches on "hours". */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "do", "does", "did", "you", "your", "yours",
  "i", "me", "my", "we", "us", "our", "it", "its", "of", "for", "to", "in", "on", "at", "by",
  "with", "and", "or", "but", "if", "then", "than", "so", "can", "could", "would", "should",
  "will", "what", "when", "where", "who", "how", "why", "there", "this", "that", "have", "has",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Title matches weigh more: a chunk titled "Opening Hours" should win "what time do you open". */
const TITLE_WEIGHT = 2;

export class InMemoryKeywordRetriever implements KnowledgeRetriever {
  private readonly chunks: readonly KnowledgeChunk[];

  constructor(chunks: readonly KnowledgeChunk[]) {
    this.chunks = chunks;
  }

  async retrieve(query: KnowledgeQuery): Promise<readonly RetrievedKnowledge[]> {
    const queryTerms = tokenize(query.text);
    if (queryTerms.length === 0) return [];

    const scored: RetrievedKnowledge[] = [];

    for (const chunk of this.chunks) {
      if (chunk.businessId !== query.businessId) continue; // hard tenant isolation

      const contentTokens = tokenize(chunk.content);
      const titleTokens = tokenize(chunk.title);
      if (contentTokens.length === 0 && titleTokens.length === 0) continue;

      let matchWeight = 0;
      for (const term of queryTerms) {
        const contentHits = contentTokens.filter((t) => t === term).length;
        const titleHits = titleTokens.filter((t) => t === term).length;
        if (contentHits > 0) matchWeight += 1 + Math.log1p(contentHits - 1);
        if (titleHits > 0) matchWeight += TITLE_WEIGHT;
      }

      if (matchWeight === 0) continue;

      // Normalize against the best achievable weight so scores land in 0–1.
      const maxWeight = queryTerms.length * (1 + TITLE_WEIGHT);
      scored.push({ chunk, score: Math.min(1, matchWeight / maxWeight) });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, query.limit);
  }
}
