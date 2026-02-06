/**
 * Lexer Unit Tests
 *
 * Tests the tokenization behavior of the Manifest language lexer.
 * Comprehensive coverage for all token types and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { Lexer, KEYWORDS } from './lexer';

describe('Lexer', () => {
  describe('Keywords', () => {
    it('should tokenize all entity-related keywords', () => {
      const source = 'entity property behavior constraint flow effect expose compose';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(8);
      // Position is recorded after reading the token (points to next char)
      expect(tokens[0]).toEqual({ type: 'KEYWORD', value: 'entity', position: { line: 1, column: 7 } });
      expect(tokens[1]).toEqual({ type: 'KEYWORD', value: 'property', position: { line: 1, column: 16 } });
    });

    it('should tokenize all command-related keywords', () => {
      const source = 'command on when then emit mutate compute guard publish persist';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(10);
    });

    it('should tokenize all type keywords', () => {
      const source = 'string number boolean list map any void';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(7);
    });

    it('should tokenize literal keywords', () => {
      const source = 'true false null';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(3);
      expect(tokens[0].value).toBe('true');
      expect(tokens[1].value).toBe('false');
      expect(tokens[2].value).toBe('null');
    });

    it('should tokenize modifier keywords', () => {
      const source = 'required unique indexed private readonly optional';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(6);
    });

    it('should tokenize relationship keywords', () => {
      const source = 'hasMany hasOne belongsTo ref through';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(5);
    });

    it('should tokenize policy and security keywords', () => {
      const source = 'policy read write delete execute all override allow deny';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(9);
    });

    it('should tokenize logical operator keywords', () => {
      const source = 'and or not is in contains';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(6);
    });

    it('should tokenize special context keywords', () => {
      const source = 'user self context';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(3);
    });

    it('should tokenize vNext constraint keywords', () => {
      const source = 'overrideable ok warn block';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(4);
      expect(tokens[0].value).toBe('overrideable');
      expect(tokens[1].value).toBe('ok');
      expect(tokens[2].value).toBe('warn');
      expect(tokens[3].value).toBe('block');
    });

    it('should tokenize store type keywords', () => {
      const source = 'memory postgres supabase localStorage';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'KEYWORD')).toHaveLength(4);
    });

    it('should tokenize all reserved words from KEYWORDS set', () => {
      // Verify that all items in KEYWORDS set are correctly tokenized
      for (const keyword of KEYWORDS) {
        const tokens = new Lexer(keyword).tokenize();
        const keywordToken = tokens.find(t => t.type === 'KEYWORD' && t.value === keyword);
        expect(keywordToken).toBeDefined();
      }
    });
  });

  describe('Identifiers', () => {
    it('should tokenize simple identifiers', () => {
      const source = 'myEntity Order Item';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(3);
      expect(identifiers[0].value).toBe('myEntity');
      expect(identifiers[1].value).toBe('Order');
      expect(identifiers[2].value).toBe('Item');
    });

    it('should tokenize identifiers with underscores', () => {
      const source = 'my_entity _private internal_';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(3);
      expect(identifiers[0].value).toBe('my_entity');
      expect(identifiers[1].value).toBe('_private');
      expect(identifiers[2].value).toBe('internal_');
    });

    it('should tokenize identifiers with numbers', () => {
      const source = 'item123 user2 type3info';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(3);
      expect(identifiers[0].value).toBe('item123');
      expect(identifiers[1].value).toBe('user2');
      expect(identifiers[2].value).toBe('type3info');
    });

    it('should tokenize camelCase identifiers', () => {
      const source = 'myEntityName getOrderById';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(2);
    });

    it('should tokenize PascalCase identifiers', () => {
      const source = 'OrderService UserManager';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(2);
    });
  });

  describe('Strings', () => {
    it('should tokenize double-quoted strings', () => {
      const source = '"hello world"';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken).toBeDefined();
      expect(stringToken?.value).toBe('hello world');
    });

    it('should tokenize single-quoted strings', () => {
      const source = "'hello world'";
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken).toBeDefined();
      expect(stringToken?.value).toBe('hello world');
    });

    it('should handle escape sequences in strings', () => {
      const source = '"hello\\nworld\\ttab"';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken?.value).toBe('hello\nworld\ttab');
    });

    it('should handle escaped backslash in strings', () => {
      const source = '"path\\\\to\\\\file"';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken?.value).toBe('path\\to\\file');
    });

    it('should handle escaped quote in strings', () => {
      const source = '"say \\"hello\\""';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken?.value).toBe('say "hello"');
    });

    it('should tokenize empty strings', () => {
      const source = '""';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken?.value).toBe('');
    });

    it('should tokenize template strings', () => {
      const source = '`hello ${name}`';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken?.value).toBe('hello ${name}');
    });

    it('should handle multiline template strings', () => {
      const source = '`line1\nline2\nline3`';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken?.value).toBe('line1\nline2\nline3');
    });
  });

  describe('Numbers', () => {
    it('should tokenize integer numbers', () => {
      const source = '0 42 100 9999';
      const tokens = new Lexer(source).tokenize();

      const numbers = tokens.filter(t => t.type === 'NUMBER');
      expect(numbers).toHaveLength(4);
      expect(numbers[0].value).toBe('0');
      expect(numbers[1].value).toBe('42');
      expect(numbers[2].value).toBe('100');
      expect(numbers[3].value).toBe('9999');
    });

    it('should tokenize decimal numbers', () => {
      const source = '3.14 0.5 99.99';
      const tokens = new Lexer(source).tokenize();

      const numbers = tokens.filter(t => t.type === 'NUMBER');
      expect(numbers).toHaveLength(3);
      expect(numbers[0].value).toBe('3.14');
      expect(numbers[1].value).toBe('0.5');
      expect(numbers[2].value).toBe('99.99');
    });

    it('should tokenize numbers starting with decimal', () => {
      const source = '.5 .25';
      const tokens = new Lexer(source).tokenize();

      // The lexer treats lone '.' as an operator, not as start of number
      // Numbers must have at least one digit before or after the decimal point
      const numbers = tokens.filter(t => t.type === 'NUMBER');
      const operators = tokens.filter(t => t.type === 'OPERATOR');

      // Expect: OPERATOR(.), NUMBER(5), OPERATOR(.), NUMBER(25)
      expect(operators.filter(t => t.value === '.')).toHaveLength(2);
      expect(numbers[0].value).toBe('5');
      expect(numbers[1].value).toBe('25');
    });
  });

  describe('Operators', () => {
    it('should tokenize single-character operators', () => {
      const source = '+ - * / % = ! < >';
      const tokens = new Lexer(source).tokenize();

      const operators = tokens.filter(t => t.type === 'OPERATOR');
      expect(operators).toHaveLength(9);
    });

    it('should tokenize two-character operators', () => {
      const source = '== != <= >= && || -> => ?. ..';
      const tokens = new Lexer(source).tokenize();

      const operators = tokens.filter(t => t.type === 'OPERATOR');
      expect(operators).toHaveLength(10);
      expect(operators[0].value).toBe('==');
      expect(operators[1].value).toBe('!=');
      expect(operators[2].value).toBe('<=');
      expect(operators[3].value).toBe('>=');
      expect(operators[4].value).toBe('&&');
      expect(operators[5].value).toBe('||');
      expect(operators[6].value).toBe('->');
      expect(operators[7].value).toBe('=>');
      expect(operators[8].value).toBe('?.');
      expect(operators[9].value).toBe('..');
    });

    it('should tokenize pipe and ampersand operators', () => {
      const source = '| &';
      const tokens = new Lexer(source).tokenize();

      const operators = tokens.filter(t => t.type === 'OPERATOR');
      expect(operators).toHaveLength(2);
    });

    it('should tokenize conditional operator', () => {
      const source = '? :';
      const tokens = new Lexer(source).tokenize();

      const operators = tokens.filter(t => t.type === 'OPERATOR');
      expect(operators).toHaveLength(2);
      expect(operators[0].value).toBe('?');
      expect(operators[1].value).toBe(':');
    });

    it('should tokenize dot operators', () => {
      const source = '. .. ?.';
      const tokens = new Lexer(source).tokenize();

      const operators = tokens.filter(t => t.type === 'OPERATOR');
      expect(operators).toHaveLength(3);
    });
  });

  describe('Punctuation', () => {
    it('should tokenize all punctuation characters', () => {
      const source = '( ) { } [ ] , ; @';
      const tokens = new Lexer(source).tokenize();

      const punctuation = tokens.filter(t => t.type === 'PUNCTUATION');
      expect(punctuation).toHaveLength(9);
      expect(punctuation[0].value).toBe('(');
      expect(punctuation[1].value).toBe(')');
      expect(punctuation[2].value).toBe('{');
      expect(punctuation[3].value).toBe('}');
      expect(punctuation[4].value).toBe('[');
      expect(punctuation[5].value).toBe(']');
      expect(punctuation[6].value).toBe(',');
      expect(punctuation[7].value).toBe(';');
      expect(punctuation[8].value).toBe('@');
    });
  });

  describe('Newlines and Whitespace', () => {
    it('should tokenize newlines', () => {
      const source = 'line1\nline2\nline3';
      const tokens = new Lexer(source).tokenize();

      const newlines = tokens.filter(t => t.type === 'NEWLINE');
      expect(newlines).toHaveLength(2);
    });

    it('should handle carriage returns', () => {
      const source = 'line1\r\nline2';
      const tokens = new Lexer(source).tokenize();

      // \r is skipped as whitespace, \n is tokenized
      const newlines = tokens.filter(t => t.type === 'NEWLINE');
      expect(newlines).toHaveLength(1);
    });

    it('should skip spaces and tabs', () => {
      const source = 'word1 \t word2';
      const tokens = new Lexer(source).tokenize();

      // Should have: IDENTIFIER(word1), IDENTIFIER(word2), EOF
      expect(tokens.filter(t => t.type === 'IDENTIFIER')).toHaveLength(2);
    });

    it('should track line and column positions correctly', () => {
      const source = 'word1\nword2';
      const tokens = new Lexer(source).tokenize();

      const word1 = tokens[0];
      const newline = tokens[1];
      const word2 = tokens[2];

      // Position is recorded after reading the token (points to next char)
      // word1 is 5 chars, starts at col 1, position is col 6
      expect(word1.position).toEqual({ line: 1, column: 6 });
      expect(newline.position).toEqual({ line: 1, column: 6 });
      // word2 is 5 chars, starts at col 1 of line 2, position is col 6
      expect(word2.position).toEqual({ line: 2, column: 6 });
    });

    it('should track column position within lines', () => {
      const source = 'word1 word2';
      const tokens = new Lexer(source).tokenize();

      const word1 = tokens[0];
      const word2 = tokens[1];

      // Position is recorded after reading the token (points to next char)
      // word1 is 5 chars, starts at col 1, position is col 6
      expect(word1.position).toEqual({ line: 1, column: 6 });
      // word2 is 5 chars, starts at col 7 (after space), position is col 12
      expect(word2.position).toEqual({ line: 1, column: 12 });
    });
  });

  describe('Comments', () => {
    it('should skip single-line comments', () => {
      const source = 'word1 // this is a comment\nword2';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(2);
      expect(identifiers[0].value).toBe('word1');
      expect(identifiers[1].value).toBe('word2');
    });

    it('should skip multi-line comments', () => {
      const source = 'word1 /* multi\nline\ncomment */ word2';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(2);
    });

    it('should handle comment at end of file', () => {
      const source = 'word1 // end comment';
      const tokens = new Lexer(source).tokenize();

      expect(tokens[0].value).toBe('word1');
      expect(tokens[tokens.length - 1].type).toBe('EOF');
    });

    it('should handle multiple consecutive comments', () => {
      const source = '// comment1\n// comment2\nword';
      const tokens = new Lexer(source).tokenize();

      const identifiers = tokens.filter(t => t.type === 'IDENTIFIER');
      expect(identifiers).toHaveLength(1);
    });
  });

  describe('Position Tracking', () => {
    it('should track position for keywords', () => {
      const source = 'entity User';
      const tokens = new Lexer(source).tokenize();

      // Position is recorded after reading the token (points to next char)
      // "entity" is 6 chars, starts at col 1, position is col 7
      expect(tokens[0].position).toEqual({ line: 1, column: 7 });
      // "User" is 4 chars, starts at col 8, position is col 12
      expect(tokens[1].position).toEqual({ line: 1, column: 12 });
    });

    it('should update line count on newlines', () => {
      const source = 'word1\nword2\nword3';
      const tokens = new Lexer(source).tokenize();

      expect(tokens[0].position.line).toBe(1);
      expect(tokens[2].position.line).toBe(2);
      expect(tokens[4].position.line).toBe(3);
    });

    it('should reset column on newlines', () => {
      const source = 'word1\n  word2';
      const tokens = new Lexer(source).tokenize();

      // word1 is 5 chars, position is col 6
      expect(tokens[0].position.column).toBe(6);
      // word2 is 5 chars, starts at col 3 (after 2 spaces), position is col 8
      expect(tokens[2].position.column).toBe(8);
    });
  });

  describe('EOF', () => {
    it('should always end with EOF token', () => {
      const source = 'entity User';
      const tokens = new Lexer(source).tokenize();

      expect(tokens[tokens.length - 1].type).toBe('EOF');
    });

    it('should handle empty input', () => {
      const source = '';
      const tokens = new Lexer(source).tokenize();

      expect(tokens).toHaveLength(1);
      expect(tokens[0].type).toBe('EOF');
    });

    it('should handle whitespace-only input', () => {
      const source = '   \n\t   ';
      const tokens = new Lexer(source).tokenize();

      // The \n creates a NEWLINE token, so we have NEWLINE + EOF
      expect(tokens).toHaveLength(2);
      expect(tokens[0].type).toBe('NEWLINE');
      expect(tokens[1].type).toBe('EOF');
    });
  });

  describe('Complex Manifest Syntax', () => {
    it('should tokenize a simple entity declaration', () => {
      const source = `
        entity User {
          property name: string
          property age: number
        }
      `;
      const tokens = new Lexer(source).tokenize();

      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'entity')).toBe(true);
      expect(tokens.some(t => t.type === 'IDENTIFIER' && t.value === 'User')).toBe(true);
      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'property')).toBe(true);
    });

    it('should tokenize a command with guards', () => {
      const source = 'command updateName(id: string, name: string) when user.role == "admin"';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'command')).toBe(true);
      expect(tokens.some(t => t.type === 'IDENTIFIER' && t.value === 'updateName')).toBe(true);
      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'when')).toBe(true);
    });

    it('should tokenize a constraint with severity', () => {
      const source = 'constraint ageLimit:ok user.age >= 18';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'constraint')).toBe(true);
      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'ok')).toBe(true);
    });

    it('should tokenize overrideable constraint', () => {
      const source = 'constraint limit:overrideable:block self.amount > 1000';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'overrideable')).toBe(true);
      expect(tokens.some(t => t.type === 'KEYWORD' && t.value === 'block')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle consecutive operators', () => {
      const source = '== != <= >= && ||';
      const tokens = new Lexer(source).tokenize();

      const operators = tokens.filter(t => t.type === 'OPERATOR');
      expect(operators).toHaveLength(6);
    });

    it('should handle mixed tokens', () => {
      const source = 'entity User { property id: number = 0 }';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.some(t => t.type === 'KEYWORD')).toBe(true);
      expect(tokens.some(t => t.type === 'IDENTIFIER')).toBe(true);
      expect(tokens.some(t => t.type === 'PUNCTUATION')).toBe(true);
      expect(tokens.some(t => t.type === 'OPERATOR')).toBe(true);
      expect(tokens.some(t => t.type === 'NUMBER')).toBe(true);
    });

    it('should handle string with special characters', () => {
      const source = '"hello@world#$%"';
      const tokens = new Lexer(source).tokenize();

      const stringToken = tokens.find(t => t.type === 'STRING');
      expect(stringToken?.value).toBe('hello@world#$%');
    });

    it('should handle numbers in expressions', () => {
      const source = 'x + y * 3.14 / 2';
      const tokens = new Lexer(source).tokenize();

      expect(tokens.filter(t => t.type === 'NUMBER')).toHaveLength(2);
      expect(tokens.filter(t => t.type === 'OPERATOR')).toHaveLength(3);
    });

    it('should handle brackets and arrays', () => {
      const source = '[1, 2, 3]';
      const tokens = new Lexer(source).tokenize();

      // [ and ] are punctuation, commas are punctuation
      // Tokens: [, 1, ,, 2, ,, 3, ]
      expect(tokens.filter(t => t.type === 'PUNCTUATION')).toHaveLength(4); // [, ], comma, comma
      expect(tokens.filter(t => t.type === 'NUMBER')).toHaveLength(3); // 1, 2, 3
    });
  });
});
