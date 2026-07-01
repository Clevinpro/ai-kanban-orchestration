import { Injectable } from '@nestjs/common';
import { QueryNormalizer } from '../search/query-normalizer';
import { CapabilityDetectorService } from './capability-detector.service';

/** Lane discriminator returned by {@link QueryRouterService.classify}. */
export type QueryLane = 'meta' | 'structured' | 'technical' | 'complex';

/**
 * Rule-based patterns for API / technical documentation intent.
 * Kept synchronous so the technical lane never pays an LLM classification cost.
 */
const TECHNICAL_INTENT_PATTERNS: RegExp[] = [
  /\bapi\b/i,
  /\bendpoint(s)?\b/i,
  /\brest\b/i,
  /\bhttp(s)?\b/i,
  /\bswagger\b/i,
  /\bopenapi\b/i,
  /\bwebhook(s)?\b/i,
  /\bgraphql\b/i,
  /\bauthentication\b/i,
  /\bauthorization\b/i,
  /\bjwt\b/i,
  /\boauth\b/i,
  /\brequest (body|format|payload)\b/i,
  /\bresponse (format|schema|code)\b/i,
  /\bhow (do|to) (call|use|integrate)\b/i,
  /\btechnical (doc|documentation|spec)\b/i,
];

/**
 * Return true when `message` is a deterministic tag list/count query.
 *
 * Reuses {@link QueryNormalizer.isTagQuery} for single tag-shaped lookups
 * (`<faq>`) and keyword rules aligned with {@link parseTagQueryIntent} in
 * `tag-query.tool.ts` ("count", "how many", "list all").
 */
export function isStructuredQuery(message: string): boolean {
  if (QueryNormalizer.isTagQuery(message)) {
    return true;
  }

  const normalized = message.trim().toLowerCase();

  // Standalone tag-lane intents (aligned with parseTagQueryIntent inputs).
  if (normalized === 'count' || normalized === 'list' || normalized === 'list all') {
    return true;
  }

  const mentionsTags = /\btags?\b/.test(normalized);

  if (!mentionsTags) {
    return false;
  }

  return (
    normalized.startsWith('count ') ||
    normalized.includes('how many') ||
    normalized.includes('list all') ||
    normalized.startsWith('list ')
  );
}

/** Return true when `message` looks like an API / technical documentation query. */
export function isTechnicalQuery(message: string): boolean {
  return TECHNICAL_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Classifies an incoming user message into one of four routing lanes so
 * {@link AiService} can dispatch to the cheapest correct path (TASK-006).
 *
 * Classification order (explicit — first match wins):
 * 1. **structured** — synchronous tag/count rules; no embedding or LLM call.
 * 2. **meta** — delegates to {@link CapabilityDetectorService.isCapabilityQuery}
 *    (pre-computed embedding cosine ≥ 0.75, or regex fallback).
 * 3. **technical** — synchronous API/technical keyword rules.
 * 4. **complex** — fallthrough to the full bounded agent loop.
 */
@Injectable()
export class QueryRouterService {
  constructor(private readonly capabilityDetector: CapabilityDetectorService) {}

  async classify(message: string): Promise<QueryLane> {
    if (isStructuredQuery(message)) {
      return 'structured';
    }

    if (await this.capabilityDetector.isCapabilityQuery(message)) {
      return 'meta';
    }

    if (isTechnicalQuery(message)) {
      return 'technical';
    }

    return 'complex';
  }
}
