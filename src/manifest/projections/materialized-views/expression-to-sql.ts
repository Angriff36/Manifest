/**
 * IRExpression → PostgreSQL SQL translator.
 *
 * Used by the materialized-views projection to translate computed-property
 * expressions from the IR into SELECT expressions suitable for
 * `CREATE MATERIALIZED VIEW` bodies.
 *
 * Boundary: the translator emits literal SQL fragments. It does NOT validate
 * that the resulting SQL is well-formed; it trusts the IR expression tree
 * and the `views[].columns` overrides supplied by the consumer.
 *
 * Unsupported expression kinds produce a diagnostic. The generator collects
 * diagnostics and emits error-level entries for unsupported forms.
 */

import type { IRExpression, IRValue } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';

export interface ExpressionTranslation {
  sql: string;
  diagnostics: ProjectionDiagnostic[];
}

/**
 * Translate an IRExpression to a PostgreSQL SELECT expression.
 *
 * The `entityName` is used only for diagnostic context. The `columnResolver`
 * maps a property name (e.g. "amount") to its SQL column name (e.g. "amount")
 * — this lets the generator apply consumer-supplied column mappings.
 */
export function translateExpression(
  expr: IRExpression,
  columnResolver: (propName: string) => string | undefined,
  entityName: string,
): ExpressionTranslation {
  const diagnostics: ProjectionDiagnostic[] = [];

  const sql = translateNode(expr, columnResolver, entityName, diagnostics);

  return { sql, diagnostics };
}

function translateNode(
  expr: IRExpression,
  columnResolver: (propName: string) => string | undefined,
  entityName: string,
  diagnostics: ProjectionDiagnostic[],
): string {
  switch (expr.kind) {
    case 'literal':
      return translateLiteral(expr.value);

    case 'identifier': {
      const resolved = columnResolver(expr.name);
      if (resolved === undefined) {
        diagnostics.push({
          severity: 'error',
          code: 'UNKNOWN_PROPERTY',
          message: `Unknown property '${expr.name}' referenced in expression for entity '${entityName}'.`,
          entity: entityName,
        });
        return `"${expr.name}"`;
      }
      return resolved;
    }

    case 'member': {
      // member access: translate the object, then access a property.
      // e.g. event.payload.amount → "payload"."amount"
      const obj = translateNode(expr.object, columnResolver, entityName, diagnostics);
      return `${obj}."${expr.property}"`;
    }

    case 'binary': {
      const left = translateNode(expr.left, columnResolver, entityName, diagnostics);
      const right = translateNode(expr.right, columnResolver, entityName, diagnostics);
      const op = translateBinaryOperator(expr.operator);
      if (op === null) {
        diagnostics.push({
          severity: 'error',
          code: 'UNSUPPORTED_BINARY_OP',
          message: `Unsupported binary operator '${expr.operator}' in expression for entity '${entityName}'.`,
          entity: entityName,
        });
        return `(${left} ${expr.operator} ${right})`;
      }
      return `(${left} ${op} ${right})`;
    }

    case 'unary': {
      const operand = translateNode(expr.operand, columnResolver, entityName, diagnostics);
      const op = translateUnaryOperator(expr.operator);
      if (op === null) {
        diagnostics.push({
          severity: 'error',
          code: 'UNSUPPORTED_UNARY_OP',
          message: `Unsupported unary operator '${expr.operator}' in expression for entity '${entityName}'.`,
          entity: entityName,
        });
        return `${expr.operator} ${operand}`;
      }
      return `${op} ${operand}`;
    }

    case 'call': {
      const callee = expr.callee;
      if (callee.kind !== 'identifier') {
        diagnostics.push({
          severity: 'error',
          code: 'UNSUPPORTED_CALL',
          message: `Unsupported call expression in materialized view for entity '${entityName}'. Only direct identifier calls (e.g. SUM, COUNT) are supported.`,
          entity: entityName,
        });
        return 'NULL';
      }
      const args = expr.args
        .map((a) => translateNode(a, columnResolver, entityName, diagnostics))
        .join(', ');
      return `${callee.name}(${args})`;
    }

    case 'conditional': {
      const cond = translateNode(expr.condition, columnResolver, entityName, diagnostics);
      const cons = translateNode(expr.consequent, columnResolver, entityName, diagnostics);
      const alt = translateNode(expr.alternate, columnResolver, entityName, diagnostics);
      return `CASE WHEN ${cond} THEN ${cons} ELSE ${alt} END`;
    }

    case 'array': {
      const elements = expr.elements
        .map((e) => translateNode(e, columnResolver, entityName, diagnostics))
        .join(', ');
      return `ARRAY[${elements}]`;
    }

    case 'object': {
      diagnostics.push({
        severity: 'warning',
        code: 'OBJECT_EXPRESSION_INLINED',
        message: `Object expression in materialized view for entity '${entityName}' cannot be represented in a relational view. Emitted as JSON string.`,
        entity: entityName,
      });
      const props = expr.properties
        .map((p) => `"${p.key}", ${translateNode(p.value, columnResolver, entityName, diagnostics)}`)
        .join(', ');
      return `json_build_object(${props})`;
    }

    case 'lambda': {
      diagnostics.push({
        severity: 'error',
        code: 'UNSUPPORTED_LAMBDA',
        message: `Lambda expressions are not supported in materialized views for entity '${entityName}'.`,
        entity: entityName,
      });
      return 'NULL';
    }

    case 'aggregate': {
      // A cross-entity count is a correlated subquery, not a plain SELECT
      // expression; the materialized-view projection does not resolve child
      // columns, so this is emitted as a loud (non-silent) NULL.
      diagnostics.push({
        severity: 'error',
        code: 'UNSUPPORTED_AGGREGATE',
        message: `Aggregate count over '${expr.entity}' is not supported in materialized views for entity '${entityName}' (cross-entity subquery).`,
        entity: entityName,
      });
      return 'NULL';
    }
  }
}

function translateLiteral(value: IRValue): string {
  switch (value.kind) {
    case 'string':
      // PostgreSQL: double single-quotes for embedded single quotes.
      return `'${value.value.replace(/'/g, "''")}'`;
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'TRUE' : 'FALSE';
    case 'null':
      return 'NULL';
    case 'array': {
      const elements = value.elements.map(translateLiteral).join(', ');
      return `ARRAY[${elements}]`;
    }
    case 'object': {
      const pairs = Object.entries(value.properties)
        .map(([k, v]) => `'${k}', ${translateLiteral(v)}`)
        .join(', ');
      return `json_build_object(${pairs})`;
    }
  }
}

/**
 * Map a Manifest binary operator to its PostgreSQL counterpart.
 * Returns null for unsupported operators.
 */
function translateBinaryOperator(op: string): string | null {
  switch (op) {
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '&&':
    case '||':
      return op;
    case '===':
      return '=';
    case '!==':
      return '!=';
    case 'and':
    case 'AND':
      return 'AND';
    case 'or':
    case 'OR':
      return 'OR';
    default:
      return null;
  }
}

function translateUnaryOperator(op: string): string | null {
  switch (op) {
    case '!':
    case 'not':
    case 'NOT':
      return 'NOT';
    case '-':
      return '-';
    default:
      return null;
  }
}
