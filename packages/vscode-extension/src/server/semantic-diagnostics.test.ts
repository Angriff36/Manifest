import { describe, expect, it } from 'vitest';
import { ManifestCompiler } from '@angriff36/manifest/compiler';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

import { getCompletions } from './completion';
import { getSemanticDiagnostics } from './semantic-diagnostics';
import { getCodeActions } from './code-actions';

const source = `entity BulkOrderRule {
  key [tenantId, id]
  property required id: string
  property required tenantId: string
  property required minimumQuantity: int = 1
  property discountPercent: decimal = 0
  property effectiveFrom: datetime
  property effectiveTo: datetime
  property createdAt: datetime = now()
  property updatedAt: datetime = now()

  computed isEffective: boolean = (self.effectiveFrom == null or self.effectiveFrom <= now()) and (self.effectiveTo == null or self.effectiveTo >= now())

  command create(minimumQuantity: number, discountPercent: number, effectiveFrom: number, effectiveTo: number) {
    mutate minimumQuantity = minimumQuantity
    mutate discountPercent = discountPercent
    mutate effectiveFrom = effectiveFrom
    mutate effectiveTo = effectiveTo
    mutate createdAt = now()
    mutate updatedAt = now()
    emit BulkOrderRuleCreated
  }
}

event BulkOrderRuleCreated: "inventory.bulk-order-rule.created" {
  ruleId: string
  tenantId: string
  minimumQuantity: number
  createdAt: number
}`;

function parseProgram() {
  const compiler = new ManifestCompiler();
  const { program, errors } = compiler.parse(source);
  expect(errors).toEqual([]);
  return program;
}

describe('Manifest VS Code semantic diagnostics', () => {
  it('flags local contract issues in the BulkOrderRule example', () => {
    const diagnostics = getSemanticDiagnostics(parseProgram(), source, { enabled: true });
    const codes = diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toContain('manifest.commandParamTypeMismatch');
    expect(codes).toContain('manifest.eventPayloadNotProduced');
    expect(codes).toContain('manifest.timestampPayloadAsNumber');
    expect(codes).toContain('manifest.nullableDateCommandRequired');
    expect(codes).toContain('manifest.bareNumberStoredProperty');
    expect(diagnostics.every((diagnostic) => diagnostic.severity === DiagnosticSeverity.Warning)).toBe(true);
  });

  it('can be disabled for cheap edit loops', () => {
    expect(getSemanticDiagnostics(parseProgram(), source, { enabled: false })).toEqual([]);
  });
});

describe('Manifest VS Code completions', () => {
  it('includes supported compiler type names', () => {
    const labels = new Set(getCompletions(parseProgram()).map((item) => item.label));

    for (const typeName of [
      'string', 'number', 'boolean', 'int', 'decimal', 'money', 'datetime',
      'timestamp', 'date', 'uuid', 'email', 'url', 'list', 'array', 'map',
      'json', 'any', 'void',
    ]) {
      expect(labels.has(typeName), `${typeName} should be completed`).toBe(true);
    }
  });
});

describe('Manifest VS Code code actions', () => {
  it('offers quick fixes for type replacements and id payload renames', () => {
    const diagnostics = getSemanticDiagnostics(parseProgram(), source, { enabled: true });
    const actions = getCodeActions('file:///bulk.manifest', diagnostics);
    const titles = actions.map((action) => action.title);

    expect(titles).toContain('Change number to int');
    expect(titles).toContain('Change number to decimal');
    expect(titles).toContain('Change number to timestamp');
    expect(titles).toContain('Rename event payload field to id');
  });
});
