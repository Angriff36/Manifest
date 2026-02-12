import { Token } from './types';
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
export declare const KEYWORDS: Set<string>;
export declare class Lexer {
    private source;
    private pos;
    private line;
    private col;
    private tokens;
    constructor(source: string);
    tokenize(): Token[];
    private skipWhitespace;
    private readString;
    private readTemplate;
    private readNumber;
    private readIdentifier;
    private readOperator;
    private isDigit;
    private isAlpha;
    private isAlphaNum;
    private isOpStart;
    private advance;
    private position;
}
//# sourceMappingURL=lexer.d.ts.map