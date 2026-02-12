/**
 * Next.js App Router projection for Manifest IR.
 *
 * Generates Next.js API route handlers using App Router conventions.
 * Configurable for different auth providers and database setups.
 */
import type { IR } from '../../ir';
import type { ProjectionTarget, ProjectionRequest, ProjectionResult } from '../interface';
/**
 * Next.js projection implementation.
 */
export declare class NextJsProjection implements ProjectionTarget {
    readonly name = "nextjs";
    readonly description = "Next.js App Router API routes with configurable auth and database support";
    readonly surfaces: readonly ["nextjs.route", "nextjs.command", "ts.types", "ts.client"];
    generate(ir: IR, request: ProjectionRequest): ProjectionResult;
    private _route;
    private _types;
    private _client;
    private _command;
    /**
     * Generate POST command handler for an entity command.
     * Writes MUST flow through runtime.runCommand() to enforce guards, policies, and constraints.
     */
    private _generatePostCommandHandler;
    /**
     * Generate GET route for an entity.
     * Uses direct Prisma query (bypassing runtime) for efficiency.
     */
    private _generateGetRoute;
}
//# sourceMappingURL=generator.d.ts.map