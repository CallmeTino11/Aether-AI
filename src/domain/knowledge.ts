/**
 * Aether AI — Core Domain: Business Knowledge
 *
 * A Digital Employee's answers must be grounded in facts the business actually
 * gave it. This is the single most important safety property of the product:
 * the Receptionist spec requires "never invents business facts not in the
 * knowledge base — says it will check and escalates instead."
 *
 * `KnowledgeRetriever` is a *port*: the domain declares what it needs, and an
 * outer layer supplies the implementation (keyword search now, vector/RAG
 * later). Swapping retrieval strategy must not touch employee logic.
 */

import type { BusinessId } from "./employee.js";

export type KnowledgeSourceKind = "faq" | "service" | "policy" | "hours" | "pricing" | "document";

export interface KnowledgeChunk {
  readonly id: string;
  readonly businessId: BusinessId;
  readonly kind: KnowledgeSourceKind;
  /** Short human-readable label, shown in citations and audit logs. */
  readonly title: string;
  readonly content: string;
}

export interface RetrievedKnowledge {
  readonly chunk: KnowledgeChunk;
  /** 0–1, higher is more relevant. Comparable only within one retriever's results. */
  readonly score: number;
}

export interface KnowledgeQuery {
  readonly businessId: BusinessId;
  readonly text: string;
  readonly limit: number;
}

/** Port. Implementations live in outer layers (see src/knowledge/). */
export interface KnowledgeRetriever {
  retrieve(query: KnowledgeQuery): Promise<readonly RetrievedKnowledge[]>;
}

/**
 * Below this relevance, retrieved context is treated as noise rather than
 * grounding. Chosen conservatively: a false "I'll check with the team" is
 * cheap, a confidently wrong answer about pricing is expensive.
 *
 * Calibrated empirically against the reference keyword retriever
 * (src/knowledge/in-memory-retriever.ts) on a small clinic knowledge set:
 *   "what are your opening hours?"                        → 0.67  answer
 *   "how much does a consultation cost?"                  → 0.22  answer
 *   "consultation with a specialist on a Saturday?"       → 0.08  escalate
 *   "do you offer helicopter transfers?"                  → none  escalate
 * The third case is the important one: partially-matching questions that drift
 * beyond what the business actually documented must escalate, not be answered
 * from the nearest-looking chunk. Any replacement retriever (pgvector, etc.)
 * must be re-calibrated against this same behaviour, not just swapped in.
 */
export const MIN_GROUNDING_SCORE = 0.15;

export function hasUsableGrounding(results: readonly RetrievedKnowledge[]): boolean {
  return results.some((result) => result.score >= MIN_GROUNDING_SCORE);
}
