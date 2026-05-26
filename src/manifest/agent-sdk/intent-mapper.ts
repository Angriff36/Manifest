/**
 * Keyword-based natural-language-to-command intent mapping.
 * No LLM dependency — pure keyword and token scoring.
 */

import type { IR, IREntity } from '../ir';
import type { IntentMatch, IntentMapperOptions } from './types';
import { listEntities, listCommands } from './introspect';

// English stopwords to filter from tokenization
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  'his', 'her', 'its', 'our', 'their', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'am', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'up', 'down',
  'out', 'off', 'over', 'into', 'about', 'after', 'before', 'above', 'below', 'between',
  'through', 'during', 'under', 'again', 'further', 'once',
]);

/**
 * Tokenize a string into program-relevant tokens.
 * Splits on whitespace/punctuation and camelCase boundaries, lowercases, removes stopwords.
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .flatMap((segment) => segment.split(/(?=[A-Z])/)) // split camelCase BEFORE lowercasing
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Find commands that best match a natural-language user intent.
 * Uses multi-token keyword scoring with determinism via score desc + name asc.
 */
export function findMatchingCommands(
  ir: IR,
  userIntent: string,
  opts: IntentMapperOptions = {}
): IntentMatch[] {
  const { minScore = 0.1, entityFilter } = opts;
  const tokens = tokenize(userIntent);
  if (tokens.length === 0) return [];

  // Build searchable corpus from entities and commands
  const entities = entityFilter ? listEntities(ir).filter((e) => entityFilter(ir.entities.find((x) => x.name === e.name)!)) : listEntities(ir);

  const scored: IntentMatch[] = [];

  for (const cmd of ir.commands) {
    if (entityFilter) {
      const entity = ir.entities.find((e) => e.name === cmd.entity);
      if (entity && !entityFilter(entity)) continue;
    }

    let score = 0;
    const matchedTokens: string[] = [];
    const cmdTokens = tokenize(cmd.name);

    // +3 per command name token
    for (const tk of cmdTokens) {
      if (tokens.includes(tk)) {
        score += 3;
        matchedTokens.push(tk);
      }
    }

    // +2 per entity name token
    if (cmd.entity) {
      const entityTokens = tokenize(cmd.entity);
      for (const tk of entityTokens) {
        if (tokens.includes(tk)) {
          score += 2;
          matchedTokens.push(tk);
        }
      }
    }

    // +1 per parameter or event name token
    for (const p of cmd.parameters) {
      const pTokens = tokenize(p.name);
      for (const tk of pTokens) {
        if (tokens.includes(tk)) {
          score += 1;
          matchedTokens.push(tk);
        }
      }
    }

    for (const ev of cmd.emits) {
      const evTokens = tokenize(ev);
      for (const tk of evTokens) {
        if (tokens.includes(tk)) {
          score += 1;
          matchedTokens.push(tk);
        }
      }
    }

    // +0.5 per module name token
    if (cmd.module) {
      const modTokens = tokenize(cmd.module);
      for (const tk of modTokens) {
        if (tokens.includes(tk)) {
          score += 0.5;
          matchedTokens.push(tk);
        }
      }
    }

    if (score >= minScore) {
      scored.push({
        command: cmd.name,
        entity: cmd.entity,
        score,
        matchedTokens: [...new Set(matchedTokens)],
        reason: matchedTokens.length > 0
          ? `Matched: ${[...new Set(matchedTokens)].join(', ')}`
          : 'Command name similarity',
      });
    }
  }

  // Sort deterministically: score desc, then name asc
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.command.localeCompare(b.command);
  });

  return scored;
}
