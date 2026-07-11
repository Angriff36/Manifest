/**
 * Tests for the DynamoDB infrastructure projection.
 */

import { describe, expect, it } from 'vitest';
import { DynamoDBProjection } from './generator';
import { compileToIR } from '../../ir-compiler';
import type { IR } from '../../ir';

async function buildIR(source: string): Promise<IR> {
  const { ir } = await compileToIR(source);
  if (!ir) throw new Error('Compilation returned null IR');
  return ir;
}

const SIMPLE_IR = `
entity Order {
  property required id: string
  property total: number = 0
}

store Order in dynamodb
`;

const SINGLE_TABLE_IR = `
entity User {
  property required id: string
  property name: string
}

entity Order {
  property required id: string
  property total: number = 0
}

store User in dynamodb

store Order in dynamodb
`;

describe('DynamoDBProjection', () => {
  const projection = new DynamoDBProjection();

  it('has the correct name and surfaces', () => {
    expect(projection.name).toBe('dynamodb');
    expect(projection.surfaces).toContain('dynamodb.cloudformation');
    expect(projection.surfaces).toContain('dynamodb.cdk');
    expect(projection.surfaces).toContain('dynamodb.terraform');
  });

  it('generates a CloudFormation template for per-entity tables', async () => {
    const ir = await buildIR(SIMPLE_IR);
    const result = projection.generate(ir, { surface: 'dynamodb.cloudformation' });
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    expect(code).toContain('AWSTemplateFormatVersion');
    expect(code).toContain('AWS::DynamoDB::Table');
    expect(code).toContain('OrderTable');
    expect(code).toContain('manifest-outbox-table');
    expect(code).toContain('OutboxTable');
  });

  it('generates CDK TypeScript code', async () => {
    const ir = await buildIR(SIMPLE_IR);
    const result = projection.generate(ir, { surface: 'dynamodb.cdk' });
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    expect(code).toContain("import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'");
    expect(code).toContain('extends Stack');
    expect(code).toContain('new dynamodb.Table');
    expect(code).toContain('orderTable');
    expect(code).toContain('outboxTable');
  });

  it('generates Terraform HCL', async () => {
    const ir = await buildIR(SIMPLE_IR);
    const result = projection.generate(ir, { surface: 'dynamodb.terraform' });
    expect(result.artifacts).toHaveLength(1);
    const code = result.artifacts[0].code;
    expect(code).toContain('resource "aws_dynamodb_table"');
    expect(code).toContain('"order"');
    expect(code).toContain('"outbox"');
    expect(code).toContain('hashicorp/aws');
  });

  it('generates single-table design when configured', async () => {
    const ir = await buildIR(SINGLE_TABLE_IR);
    const result = projection.generate(ir, {
      surface: 'dynamodb.cloudformation',
      options: { singleTable: true },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('MainTable');
    // Single-table design uses HASH + RANGE keys
    expect(code).toContain('KeyType: HASH');
    expect(code).toContain('KeyType: RANGE');
  });

  it('emits a warning diagnostic for unknown surface', () => {
    const result = projection.generate({} as IR, { surface: 'dynamodb.bogus' });
    expect(result.artifacts).toHaveLength(0);
    // The error diagnostic is the last one (the no-stores info comes first)
    const errorDiag = result.diagnostics.find((d) => d.severity === 'error');
    expect(errorDiag).toBeDefined();
    expect(errorDiag!.code).toBe('dynamodb.unknown-surface');
  });

  it('emits info diagnostic when no dynamodb stores in IR', async () => {
    const source = `
entity X {
  property required id: string
}

store X in memory
`;
    const ir = await buildIR(source);
    const result = projection.generate(ir, { surface: 'dynamodb.cloudformation' });
    expect(result.diagnostics.some((d) => d.code === 'dynamodb.no-stores')).toBe(true);
  });

  it('always emits an outbox table for the transactional outbox pattern', async () => {
    const ir = await buildIR(SIMPLE_IR);
    const result = projection.generate(ir, { surface: 'dynamodb.cloudformation' });
    const code = result.artifacts[0].code;
    expect(code).toContain('OutboxTable');
    expect(code).toContain('NEW_AND_OLD_IMAGES');
  });

  it('respects custom stackName option', async () => {
    const ir = await buildIR(SIMPLE_IR);
    const result = projection.generate(ir, {
      surface: 'dynamodb.cdk',
      options: { stackName: 'myapp' },
    });
    const code = result.artifacts[0].code;
    expect(code).toContain('MyappDynamoDBStack');
    expect(code).toContain("'myapp-outbox-table'");
  });
});
