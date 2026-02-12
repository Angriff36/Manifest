import { ManifestProgram, CompilationError } from './types';
export declare class Parser {
    private tokens;
    private pos;
    private errors;
    parse(source: string): {
        program: ManifestProgram;
        errors: CompilationError[];
    };
    private parseModule;
    private parseEntity;
    private parseProperty;
    private parseComputedProperty;
    private extractDependencies;
    private parseRelationship;
    private parseCommand;
    private parsePolicy;
    private parseStore;
    private parseOutboxEvent;
    private parseType;
    private parseBehavior;
    private parseTrigger;
    private parseAction;
    private parseConstraint;
    private parseFlow;
    private parseFlowStep;
    private parseEffect;
    private parseExpose;
    private parseComposition;
    private parseComponentRef;
    private parseConnection;
    private parseExpr;
    private parseTernary;
    private parseOr;
    private parseAnd;
    private parseEquality;
    private parseComparison;
    private parseAdditive;
    private parseMultiplicative;
    private parseUnary;
    private parsePostfix;
    private parsePrimary;
    private check;
    private consume;
    /**
     * Consumes a declaration identifier token, enforcing the reserved word rule.
     * Use this ONLY at declaration sites (entity/module/command/property/parameter names, etc.).
     * Do NOT use for expression member access or object literal keys.
     *
     * If the current token is a KEYWORD (reserved word), emits a structured diagnostic
     * and returns a placeholder token to allow continued parsing (for better error recovery).
     */
    private consumeIdentifier;
    /**
     * Consumes any identifier-like token (IDENTIFIER or KEYWORD) for use in expressions.
     * This is used for member access properties and object literal keys where keywords are allowed.
     */
    private consumeIdentifierOrKeyword;
    private advance;
    private current;
    private isEnd;
    private skipNL;
    private sync;
}
//# sourceMappingURL=parser.d.ts.map