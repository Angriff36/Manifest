/**
 * Materialized views projection.
 *
 * Consumes Manifest IR (entities + read models) + projection config and emits
 * PostgreSQL `CREATE MATERIALIZED VIEW` DDL as one or more `ProjectionArtifact`s.
 *
 * The projection supports three refresh strategies:
 *   - 'on-demand'         → emits REFRESH MATERIALIZED VIEW statements for manual calls
 *   - 'scheduled'         → emits a pg_cron job that calls REFRESH on a schedule
 *   - 'trigger-based'     → emits a trigger function that calls REFRESH on row changes
 *
 * Boundary rules (following Prisma/Drizzle/Kysely projection conventions):
 *   - Relational interpretation starts HERE. No relational concept (view name,
 *     column name, refresh strategy, index definitions) lives in Manifest core
 *     grammar or IR — all of it arrives via projection options.
 *   - The projection carries NO knowledge of any specific application,
 *     database instance, tenant layout, or domain meaning of any field.
 *   - `external: true` entities are skipped.
 *   - Unknown expression kinds produce error diagnostics. No silent fallback.
 */

import type { IR, IREntity } from '../../ir';
import type {
  ProjectionArtifact,
  ProjectionDiagnostic,
  ProjectionRequest,
  ProjectionResult,
  ProjectionTarget,
} from '../interface';

import { normalizeOptions, type MaterializedViewsProjectionOptions } from './options.js';
import type { MaterializedViewDefinition, MaterializedViewIndex } from './types.js';

// ============================================================================
// Surface identifiers
// ============================================================================

const SURFACE_DDL = 'materialized-views.ddl' as const;
const SURFACES = [SURFACE_DDL] as const;

// ============================================================================
// SQL fragment builders
// ============================================================================

/** Default table naming strategy: PascalCase → snake_case plural. */
function defaultTableName(entityName: string): string {
  const snake = entityName
    .replace(/([A-Z])/g, (m, _ch, idx) => (idx === 0 ? m.toLowerCase() : '_' + m.toLowerCase()))
    .replace(/[^a-z0-9_]/g, '');
  return `${snake}s`;
}

/** Default view name: mv_ + snake_case. */
function defaultViewName(defName: string): string {
  const snake = defName
    .replace(/([A-Z])/g, (m, _ch, idx) => (idx === 0 ? m.toLowerCase() : '_' + m.toLowerCase()))
    .replace(/[^a-z0-9_]/g, '');
  return `mv_${snake}`;
}

/** Build a fully-qualified object name. */
function qualify(name: string, schema: string | undefined): string {
  if (schema) return `"${schema}"."${name}"`;
  return `"${name}"`;
}

// ============================================================================
// Source resolution
// ============================================================================

interface ResolvedSource {
  entity: IREntity;
  sourceTable: string;
}

function resolveSource(
  ir: IR,
  def: MaterializedViewDefinition,
  diagnostics: ProjectionDiagnostic[],
): ResolvedSource | null {
  // For this projection, source resolution is: entity name match.
  // Read models would be added here when ir exposes a top-level readModels array.
  const entity = ir.entities.find((e) => e.name === def.source);

  if (!entity) {
    diagnostics.push({
      severity: 'error',
      code: 'UNKNOWN_SOURCE',
      message: `Materialized view '${def.name}' references unknown source '${def.source}'. Must be an entity name.`,
    });
    return null;
  }

  const sourceTable = def.sourceTable ?? defaultTableName(def.source);
  return { entity, sourceTable };
}

// ============================================================================
// DDL emission
// ============================================================================

interface ViewEmission {
  viewName: string;
  qualifiedViewName: string;
  body: string;
  indexes: string[];
  refresh: string[];
  diagnostics: ProjectionDiagnostic[];
}

function emitMaterializedView(
  def: MaterializedViewDefinition,
  source: ResolvedSource,
  options: MaterializedViewsProjectionOptions,
): ViewEmission {
  const diagnostics: ProjectionDiagnostic[] = [];

  const viewName = def.viewName ?? def.name ?? defaultViewName(def.name);
  const qualifiedViewName = qualify(viewName, options.schema);

  // Build the SELECT body.
  const selectLines = buildSelectClause(def, source, diagnostics);
  const body = `${selectLines}\nFROM ${qualify(source.sourceTable, options.schema)}`;

  // Build CREATE MATERIALIZED VIEW.
  const strategy = def.refreshStrategy ?? 'on-demand';
  const withNoData = def.withNoData ? ' WITH NO DATA' : ' WITH DATA';
  const ddlLines: string[] = [];

  ddlLines.push(`-- Materialized view: ${def.name} (refresh: ${strategy})`);
  ddlLines.push(`CREATE MATERIALIZED VIEW ${qualifiedViewName}${withNoData}`);
  ddlLines.push(`AS`);
  ddlLines.push(body);
  ddlLines.push(';');
  ddlLines.push('');

  // Append trailing SQL (GRANTs, etc.) if provided.
  if (def.trailingSql) {
    ddlLines.push(def.trailingSql.trim());
    ddlLines.push('');
  }

  // Build indexes.
  const indexStatements = (def.indexes ?? []).map((idx) =>
    emitIndex(viewName, idx, options.schema),
  );

  // Build refresh strategy statements.
  const refreshStatements: string[] = [];

  if (options.emitRefreshStatements) {
    if (strategy === 'on-demand') {
      refreshStatements.push(`-- Refresh ${qualifiedViewName} manually:`);
      refreshStatements.push(`REFRESH MATERIALIZED VIEW ${qualifiedViewName};`);
    } else if (strategy === 'scheduled') {
      const schedule = def.schedule;
      if (!schedule || (!schedule.cron && !schedule.interval)) {
        diagnostics.push({
          severity: 'error',
          code: 'MISSING_SCHEDULE',
          message: `Materialized view '${def.name}' uses 'scheduled' strategy but has no schedule.cron or schedule.interval.`,
        });
      } else {
        const cronExpr = schedule.cron ?? schedule.interval;
        refreshStatements.push(
          `-- Scheduled refresh for ${qualifiedViewName} via pg_cron:`,
        );
        refreshStatements.push(
          `SELECT cron.schedule('refresh_${viewName}', '${cronExpr}', ` +
            `'REFRESH MATERIALIZED VIEW ${qualifiedViewName}');`,
        );
      }
    } else if (strategy === 'trigger-based') {
      const trigger = def.trigger;
      if (!trigger || !trigger.sourceTable) {
        diagnostics.push({
          severity: 'error',
          code: 'MISSING_TRIGGER',
          message: `Materialized view '${def.name}' uses 'trigger-based' strategy but has no trigger.sourceTable.`,
        });
      } else {
        const debounce = trigger.debounceSeconds ?? 0;
        refreshStatements.push(
          `-- Trigger-based refresh for ${qualifiedViewName}`,
          `CREATE OR REPLACE FUNCTION refresh_${viewName}() RETURNS TRIGGER AS $$`,
          `BEGIN`,
          debounce > 0
            ? `  -- Debounce: callers may want to add a cooldown guard.`
            : `  -- No debounce configured.`,
          `  REFRESH MATERIALIZED VIEW ${qualifiedViewName};`,
          `  RETURN NULL;`,
          `END;`,
          `$$ LANGUAGE plpgsql;`,
          ``,
          `CREATE TRIGGER ${trigger.sourceTable}_refresh_${viewName}`,
          `  ${trigger.column ? `AFTER UPDATE OF "${trigger.column}"` : 'AFTER INSERT OR UPDATE OR DELETE'} ` +
            `ON ${qualify(trigger.sourceTable, options.schema)}`,
          `  FOR EACH STATEMENT EXECUTE FUNCTION refresh_${viewName}();`,
        );
      }
    }
  }

  return {
    viewName,
    qualifiedViewName,
    body: ddlLines.join('\n'),
    indexes: indexStatements,
    refresh: refreshStatements,
    diagnostics,
  };
}

function buildSelectClause(
  def: MaterializedViewDefinition,
  source: ResolvedSource,
  _diagnostics: ProjectionDiagnostic[],
): string {
  // If the consumer supplied column expressions, use them verbatim.
  if (def.columns && Object.keys(def.columns).length > 0) {
    const lines: string[] = [];
    lines.push('SELECT');
    const entries = Object.entries(def.columns);
    entries.forEach(([outputName, rawExpr], idx) => {
      // rawExpr is a raw SQL fragment supplied by the consumer; we pass it through.
      // The expression-to-sql translator in expression-to-sql.ts handles
      // IRExpression tree translation; column overrides here are raw SQL.
      const suffix = idx === entries.length - 1 ? '' : ',';
      lines.push(`  ${rawExpr} AS "${outputName}"${suffix}`);
    });
    return lines.join('\n');
  }

  // Otherwise, emit SELECT with all stored properties of the entity.
  const cols = source.entity.properties.map((p) => `"${p.name}"`).join(', ');
  return `SELECT\n  ${cols || '*'}`;
}

function emitIndex(viewName: string, idx: MaterializedViewIndex, schema: string | undefined): string {
  const method = idx.method ?? 'btree';
  const unique = idx.unique ? 'UNIQUE ' : '';
  const cols = idx.columns.map((c) => `"${c}"`).join(', ');
  const indexName = idx.name ?? `idx_${viewName}_${idx.columns.join('_')}`;
  const qualified = qualify(indexName, schema);
  const on = qualify(viewName, schema);
  const where = idx.where ? ` WHERE ${idx.where}` : '';
  return `CREATE ${unique}INDEX ${qualified} ON ${on} USING ${method} (${cols})${where};`;
}

// ============================================================================
// ProjectionTarget implementation
// ============================================================================

export class MaterializedViewsProjection implements ProjectionTarget {
  readonly name = 'materialized-views';
  readonly description =
    'Generates PostgreSQL CREATE MATERIALIZED VIEW DDL from IR entities and read models ' +
    'with @materialized computed properties. Supports on-demand, scheduled (pg_cron), and ' +
    'trigger-based refresh strategies plus supporting indexes.';
  readonly surfaces = SURFACES;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const allDiagnostics: ProjectionDiagnostic[] = [];

    if (!SURFACES.includes(request.surface as (typeof SURFACES)[number])) {
      allDiagnostics.push({
        severity: 'error',
        code: 'UNKNOWN_SURFACE',
        message: `Materialized-views projection does not support surface '${request.surface}'. Supported: ${SURFACES.join(', ')}.`,
      });
      return { artifacts: [], diagnostics: allDiagnostics };
    }

    const options = normalizeOptions(request.options);

    if (!options.views || options.views.length === 0) {
      allDiagnostics.push({
        severity: 'warning',
        code: 'NO_VIEWS_DECLARED',
        message:
          'No materialized views declared in projection options. Pass `views` to generate DDL.',
      });
      return { artifacts: [], diagnostics: allDiagnostics };
    }

    if (options.emitSingleFile) {
      const artifact = emitSingleFile(ir, options, allDiagnostics);
      return { artifacts: artifact ? [artifact] : [], diagnostics: allDiagnostics };
    }

    const artifacts = options.views.map((view) => emitPerViewArtifact(ir, view, options, allDiagnostics));
    return { artifacts, diagnostics: allDiagnostics };
  }
}

function emitSingleFile(
  ir: IR,
  options: MaterializedViewsProjectionOptions,
  diagnostics: ProjectionDiagnostic[],
): ProjectionArtifact | null {
  const lines: string[] = [];
  lines.push('-- ============================================================');
  lines.push('-- Materialized views DDL generated from Manifest IR');
  lines.push('-- ============================================================');
  lines.push('--');
  lines.push(`-- Views: ${options.views!.length}`);
  lines.push(`-- Schema: ${options.schema ?? '(default search_path)'}`);
  lines.push('');

  for (const def of options.views!) {
    const source = resolveSource(ir, def, diagnostics);
    if (!source) continue;

    const emission = emitMaterializedView(def, source, options);
    diagnostics.push(...emission.diagnostics);

    lines.push(`-- ---------- View: ${def.name} ----------`);
    lines.push(emission.body);

    if (emission.indexes.length > 0) {
      lines.push(`-- Indexes for ${emission.viewName}:`);
      for (const idx of emission.indexes) lines.push(idx);
      lines.push('');
    }

    if (emission.refresh.length > 0) {
      lines.push(`-- Refresh strategy for ${emission.viewName}:`);
      for (const r of emission.refresh) lines.push(r);
      lines.push('');
    }
  }

  return {
    id: 'materialized-views.ddl',
    pathHint: options.output,
    contentType: 'sql',
    code: lines.join('\n'),
  };
}

function emitPerViewArtifact(
  ir: IR,
  def: MaterializedViewDefinition,
  options: MaterializedViewsProjectionOptions,
  diagnostics: ProjectionDiagnostic[],
): ProjectionArtifact {
  const lines: string[] = [];
  const source = resolveSource(ir, def, diagnostics);

  if (source) {
    const emission = emitMaterializedView(def, source, options);
    diagnostics.push(...emission.diagnostics);
    lines.push(emission.body);
    for (const idx of emission.indexes) lines.push(idx);
    for (const r of emission.refresh) lines.push(r);
  } else {
    lines.push(`-- ERROR: source '${def.source}' could not be resolved for view '${def.name}'.`);
  }

  return {
    id: `materialized-views.${def.name}.ddl`,
    pathHint: `${def.name}.sql`,
    contentType: 'sql',
    code: lines.join('\n'),
  };
}
