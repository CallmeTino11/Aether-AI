/**
 * Aether AI — Knowledge: Postgres Full-Text Retriever
 *
 * Production retriever, replacing the in-memory reference implementation.
 *
 * SCORING — read before changing anything here.
 *
 * DEC-0006 requires that any replacement retriever be *re-calibrated* against
 * the documented grounding behaviour, not dropped in blind. Postgres' raw
 * `ts_rank` is NOT interchangeable with the reference retriever's 0–1 score:
 * measured on the calibration set it returned 0.187 for a clear match and
 * 0.168 for a decent one — everything crushed into a narrow band just above
 * MIN_GROUNDING_SCORE (0.15). Reusing the threshold against raw ts_rank would
 * have been coincidence, and one longer knowledge document would have pushed a
 * legitimately-grounded answer below the line, silently turning correct answers
 * into escalations.
 *
 * So scoring here is **query-term coverage, squared**: the fraction of the
 * query's meaningful lexemes (stemmed, stop-words removed by Postgres) that
 * appear in the chunk, squared to penalise partial coverage steeply.
 * `ts_rank` is used only to order results of equal coverage.
 *
 * Measured against the same calibration set as the reference retriever:
 *
 *   "what are your opening hours?"                → 1.00  answer
 *   "how much does a consultation cost?"          → 0.44  answer
 *   "opening hours on saturday"                   → 0.44  answer (grounded)
 *   "consultation with a specialist on a Saturday"→ 0.11  ESCALATE
 *   "do you offer helicopter transfers?"          → 0.00  ESCALATE
 *
 * Margins are wide on both sides of the threshold, which is the property raw
 * ts_rank lacked. See src/__tests__/postgres-retriever.integration.test.ts —
 * those cases are asserted, so a future change that breaks calibration fails CI.
 */

import type {
  KnowledgeQuery,
  KnowledgeRetriever,
  RetrievedKnowledge,
} from "../domain/knowledge.js";
import { asBusinessId } from "../domain/employee.js";
import type { SqlExecutor } from "../infrastructure/postgres/sql-executor.js";

/** Steepness of the partial-coverage penalty. See scoring note above. */
const COVERAGE_EXPONENT = 2;

interface RetrievalRow {
  readonly id: string;
  readonly business_id: string;
  readonly kind: string;
  readonly title: string;
  readonly content: string;
  readonly score: string | number;
}

export class PostgresKnowledgeRetriever implements KnowledgeRetriever {
  constructor(private readonly sql: SqlExecutor) {}

  async retrieve(query: KnowledgeQuery): Promise<readonly RetrievedKnowledge[]> {
    // `query_lexemes` uses to_tsvector on the *query* so stemming and stop-word
    // removal are Postgres' own — the same rules applied to the stored content.
    // The `@@` prefilter lets the GIN index exclude non-matching chunks before
    // the per-lexeme coverage count runs.
    const rows = await this.sql.query<RetrievalRow>(
      `
      with query_lexemes as (
        select array_agg(lexeme) as lexemes
        from unnest(to_tsvector('english', $2)) as t(lexeme)
      )
      select k.id,
             k.business_id,
             k.kind,
             k.title,
             k.content,
             power(
               (select count(*)::float from unnest(q.lexemes) l
                 where to_tsvector('english', k.title || ' ' || k.content)
                       @@ plainto_tsquery('english', l))
               / nullif(array_length(q.lexemes, 1), 0),
               $4
             ) as score
      from knowledge_chunks k
      cross join query_lexemes q
      where k.business_id = $1
        and to_tsvector('english', k.title || ' ' || k.content)
            @@ websearch_to_tsquery('english', replace($2, ' ', ' or '))
      order by score desc nulls last,
               ts_rank(to_tsvector('english', k.title || ' ' || k.content),
                       plainto_tsquery('english', $2)) desc
      limit $3
      `,
      [query.businessId, query.text, query.limit, COVERAGE_EXPONENT],
    );

    return rows
      .map((row) => ({
        chunk: {
          id: row.id,
          businessId: asBusinessId(row.business_id),
          kind: row.kind as RetrievedKnowledge["chunk"]["kind"],
          title: row.title,
          content: row.content,
        },
        score: typeof row.score === "number" ? row.score : Number.parseFloat(row.score),
      }))
      .filter((result) => Number.isFinite(result.score));
  }
}
