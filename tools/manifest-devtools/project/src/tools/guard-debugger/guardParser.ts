export type ASTNode =
  | { type: 'number'; value: number; source: string }
  | { type: 'string'; value: string; source: string }
  | { type: 'boolean'; value: boolean; source: string }
  | { type: 'null'; source: string }
  | { type: 'identifier'; name: string; source: string }
  | { type: 'property_access'; object: ASTNode; property: string; source: string }
  | { type: 'comparison'; op: string; left: ASTNode; right: ASTNode; source: string }
  | { type: 'logical_and'; left: ASTNode; right: ASTNode; source: string }
  | { type: 'logical_or'; left: ASTNode; right: ASTNode; source: string }
  | { type: 'logical_not'; operand: ASTNode; source: string }
  | { type: 'function_call'; name: string; args: ASTNode[]; source: string }
  | { type: 'group'; expr: ASTNode; source: string };

interface Token {
  type: string;
  value: string;
  pos: number;
}

const KEYWORD_MAP: Record<string, string> = {
  and: 'and',
  or: 'or',
  not: 'not',
  when: 'when',
  guard: 'when',
  true: 'boolean',
  false: 'boolean',
  null: 'null',
};

class Lexer {
  private pos = 0;
  private tokens: Token[] = [];

  constructor(private input: string) {}

  tokenize(): Token[] {
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      const ch = this.input[this.pos];

      if (ch === '"' || ch === "'") {
        this.readString(ch);
      } else if (/\d/.test(ch)) {
        this.readNumber();
      } else if (/[a-zA-Z_]/.test(ch)) {
        this.readIdentifier();
      } else if (this.pos + 1 < this.input.length && '=!><'.includes(ch) && this.input[this.pos + 1] === '=') {
        this.tokens.push({ type: 'operator', value: this.input.slice(this.pos, this.pos + 2), pos: this.pos });
        this.pos += 2;
      } else if (ch === '>' || ch === '<') {
        this.tokens.push({ type: 'operator', value: ch, pos: this.pos });
        this.pos++;
      } else if (ch === '(') {
        this.tokens.push({ type: 'lparen', value: '(', pos: this.pos });
        this.pos++;
      } else if (ch === ')') {
        this.tokens.push({ type: 'rparen', value: ')', pos: this.pos });
        this.pos++;
      } else if (ch === ',') {
        this.tokens.push({ type: 'comma', value: ',', pos: this.pos });
        this.pos++;
      } else if (ch === '.') {
        this.tokens.push({ type: 'dot', value: '.', pos: this.pos });
        this.pos++;
      } else {
        this.pos++;
      }
    }

    this.tokens.push({ type: 'eof', value: '', pos: this.pos });
    return this.tokens;
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
  }

  private readString(quote: string) {
    const start = this.pos;
    this.pos++;
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') this.pos++;
      this.pos++;
    }
    this.pos++;
    this.tokens.push({ type: 'string', value: this.input.slice(start, this.pos), pos: start });
  }

  private readNumber() {
    const start = this.pos;
    while (this.pos < this.input.length && /[\d.]/.test(this.input[this.pos])) this.pos++;
    this.tokens.push({ type: 'number', value: this.input.slice(start, this.pos), pos: start });
  }

  private readIdentifier() {
    const start = this.pos;
    while (this.pos < this.input.length && /[a-zA-Z_0-9]/.test(this.input[this.pos])) this.pos++;
    const value = this.input.slice(start, this.pos);
    const type = KEYWORD_MAP[value] || 'identifier';
    this.tokens.push({ type, value, pos: start });
  }
}

class Parser {
  private pos = 0;

  constructor(
    private tokens: Token[],
    private input: string
  ) {}

  parse(): ASTNode {
    if (this.peek().type === 'when') this.advance();
    const expr = this.parseOr();
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'eof', value: '', pos: this.input.length };
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.peek().type === 'or') {
      this.advance();
      const right = this.parseAnd();
      left = { type: 'logical_or', left, right, source: `${left.source} or ${right.source}` };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseNot();
    while (this.peek().type === 'and') {
      this.advance();
      const right = this.parseNot();
      left = { type: 'logical_and', left, right, source: `${left.source} and ${right.source}` };
    }
    return left;
  }

  private parseNot(): ASTNode {
    if (this.peek().type === 'not') {
      this.advance();
      const operand = this.parseNot();
      return { type: 'logical_not', operand, source: `not ${operand.source}` };
    }
    return this.parseComparison();
  }

  private parseComparison(): ASTNode {
    const left = this.parsePrimary();
    const token = this.peek();
    if (token.type === 'operator' && ['==', '!=', '>', '<', '>=', '<='].includes(token.value)) {
      const op = this.advance();
      const right = this.parsePrimary();
      return { type: 'comparison', op: op.value, left, right, source: `${left.source} ${op.value} ${right.source}` };
    }
    return left;
  }

  private parsePrimary(): ASTNode {
    const token = this.peek();

    if (token.type === 'lparen') {
      this.advance();
      const expr = this.parseOr();
      if (this.peek().type === 'rparen') this.advance();
      return { type: 'group', expr, source: `(${expr.source})` };
    }

    if (token.type === 'number') {
      this.advance();
      return { type: 'number', value: parseFloat(token.value), source: token.value };
    }

    if (token.type === 'string') {
      this.advance();
      return { type: 'string', value: token.value.slice(1, -1), source: token.value };
    }

    if (token.type === 'boolean') {
      this.advance();
      return { type: 'boolean', value: token.value === 'true', source: token.value };
    }

    if (token.type === 'null') {
      this.advance();
      return { type: 'null', source: 'null' };
    }

    if (token.type === 'identifier') {
      this.advance();
      let node: ASTNode = { type: 'identifier', name: token.value, source: token.value };

      while (this.peek().type === 'dot') {
        this.advance();
        const prop = this.advance();
        node = {
          type: 'property_access',
          object: node,
          property: prop.value,
          source: `${node.source}.${prop.value}`,
        };
      }

      if (this.peek().type === 'lparen') {
        this.advance();
        const args: ASTNode[] = [];
        if (this.peek().type !== 'rparen') {
          args.push(this.parseOr());
          while (this.peek().type === 'comma') {
            this.advance();
            args.push(this.parseOr());
          }
        }
        if (this.peek().type === 'rparen') this.advance();
        const name = node.source;
        const argsSource = args.map((a) => a.source).join(', ');
        return { type: 'function_call', name, args, source: `${name}(${argsSource})` };
      }

      return node;
    }

    this.advance();
    return { type: 'null', source: token.value || '?' };
  }
}

export function parseGuardExpression(input: string): { ast: ASTNode | null; error: string | null } {
  try {
    const trimmed = input.trim();
    if (!trimmed) return { ast: null, error: 'Empty expression' };
    const lexer = new Lexer(trimmed);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, trimmed);
    const ast = parser.parse();
    return { ast, error: null };
  } catch (e) {
    return { ast: null, error: e instanceof Error ? e.message : 'Parse error' };
  }
}
