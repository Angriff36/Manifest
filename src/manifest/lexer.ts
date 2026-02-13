import { Token, Position } from './types';

/**
 * RESERVED WORDS
 *
 * These tokens are reserved words in the Manifest language and may NOT be used
 * as identifiers (entity names, command names, property names, parameter names,
 * module names, policy names, constraint names, event names, etc.).
 *
 * Using a reserved word as an identifier will result in a compilation error
 * with a specific diagnostic message.
 *
 * This is the authoritative, single source of truth for reserved words.
 * Do NOT create a second list elsewhere.
 */
export const KEYWORDS = new Set([
  'entity', 'property', 'behavior', 'constraint', 'flow', 'effect', 'expose', 'compose',
  'command', 'module', 'policy', 'store', 'event', 'computed', 'derived',
  'hasMany', 'hasOne', 'belongsTo', 'ref', 'through',
  'on', 'when', 'then', 'emit', 'mutate', 'compute', 'guard', 'publish', 'persist',
  'as', 'from', 'to', 'with', 'where', 'connect', 'returns',
  'string', 'number', 'boolean', 'list', 'map', 'any', 'void',
  'true', 'false', 'null',
  'required', 'unique', 'indexed', 'private', 'readonly', 'optional',
  'rest', 'graphql', 'websocket', 'function', 'server',
  'http', 'storage', 'timer', 'custom',
  'memory', 'postgres', 'supabase', 'localStorage',
  'read', 'write', 'delete', 'execute', 'all', 'override', 'allow', 'deny',
  'and', 'or', 'not', 'is', 'in', 'contains',
  'user', 'self', 'context',
  // vNext constraint keywords
  'overrideable', 'ok', 'warn', 'block',
  // vNext optimistic concurrency keywords
  'versionProperty', 'versionAtProperty',
  // vNext state transition keywords
  'transition'
]);

const OPERATORS = new Set([
  '+', '-', '*', '/', '%', '=', '==', '!=', '<', '>', '<=', '>=',
  '&&', '||', '!', '?', ':', '->', '=>', '|', '&', '.', '..', '?.'
]);

const PUNCTUATION = new Set(['(', ')', '{', '}', '[', ']', ',', ';', '@']);

export class Lexer {
  private source: string;
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      const char = this.source[this.pos];

      if (char === '\n') {
        this.tokens.push({ type: 'NEWLINE', value: '\n', position: this.position() });
        this.advance();
        this.line++;
        this.col = 1;
        continue;
      }

      if (char === '"' || char === "'") { this.readString(char); continue; }
      if (char === '`') { this.readTemplate(); continue; }
      if (this.isDigit(char)) { this.readNumber(); continue; }
      if (this.isAlpha(char) || char === '_') { this.readIdentifier(); continue; }
      if (this.isOpStart(char)) { this.readOperator(); continue; }
      if (PUNCTUATION.has(char)) {
        this.tokens.push({ type: 'PUNCTUATION', value: char, position: this.position() });
        this.advance();
        continue;
      }
      this.advance();
    }

    this.tokens.push({ type: 'EOF', value: '', position: this.position() });
    return this.tokens;
  }

  private skipWhitespace() {
    while (this.pos < this.source.length) {
      const c = this.source[this.pos];
      if (c === ' ' || c === '\t' || c === '\r') { this.advance(); continue; }
      if (c === '/' && this.source[this.pos + 1] === '/') {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') this.advance();
        continue;
      }
      if (c === '/' && this.source[this.pos + 1] === '*') {
        this.advance(); this.advance();
        while (this.pos < this.source.length && !(this.source[this.pos] === '*' && this.source[this.pos + 1] === '/')) {
          if (this.source[this.pos] === '\n') { this.line++; this.col = 0; }
          this.advance();
        }
        this.advance(); this.advance();
        continue;
      }
      break;
    }
  }

  private readString(quote: string) {
    this.advance();
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== quote) {
      if (this.source[this.pos] === '\\') {
        this.advance();
        const esc = this.source[this.pos];
        value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
      } else {
        value += this.source[this.pos];
      }
      this.advance();
    }
    this.advance();
    this.tokens.push({ type: 'STRING', value, position: this.position() });
  }

  private readTemplate() {
    this.advance();
    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '`') {
      if (this.source[this.pos] === '\n') { this.line++; this.col = 0; }
      value += this.source[this.pos];
      this.advance();
    }
    this.advance();
    this.tokens.push({ type: 'STRING', value, position: this.position() });
  }

  private readNumber() {
    let value = '';
    while (this.pos < this.source.length && (this.isDigit(this.source[this.pos]) || this.source[this.pos] === '.')) {
      value += this.source[this.pos];
      this.advance();
    }
    this.tokens.push({ type: 'NUMBER', value, position: this.position() });
  }

  private readIdentifier() {
    let value = '';
    while (this.pos < this.source.length && (this.isAlphaNum(this.source[this.pos]) || this.source[this.pos] === '_')) {
      value += this.source[this.pos];
      this.advance();
    }
    this.tokens.push({ type: KEYWORDS.has(value) ? 'KEYWORD' : 'IDENTIFIER', value, position: this.position() });
  }

  private readOperator() {
    const two = this.source.slice(this.pos, this.pos + 2);
    if (OPERATORS.has(two)) {
      this.tokens.push({ type: 'OPERATOR', value: two, position: this.position() });
      this.advance(); this.advance();
    } else {
      this.tokens.push({ type: 'OPERATOR', value: this.source[this.pos], position: this.position() });
      this.advance();
    }
  }

  private isDigit(c: string) { return c >= '0' && c <= '9'; }
  private isAlpha(c: string) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
  private isAlphaNum(c: string) { return this.isAlpha(c) || this.isDigit(c); }
  private isOpStart(c: string) { return OPERATORS.has(c) || OPERATORS.has(c + this.source[this.pos + 1]); }
  private advance() { this.pos++; this.col++; }
  private position(): Position { return { line: this.line, column: this.col }; }
}
