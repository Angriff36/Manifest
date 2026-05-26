/**
 * CLI docs command tests
 *
 * Tests the manifest docs command for documentation generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { docsCommand } from './docs.js';

// Minimal IR fixture for testing
const SAMPLE_IR = {
  version: '1.0',
  provenance: {
    contentHash: 'test-hash',
    irHash: 'test-ir-hash',
    compilerVersion: '1.0.0',
    schemaVersion: '1.0',
    compiledAt: '2024-01-01T00:00:00.000Z',
  },
  modules: [],
  entities: [
    {
      name: 'Task',
      properties: [
        {
          name: 'title',
          type: { name: 'string', nullable: false },
          defaultValue: { kind: 'string', value: '' },
          modifiers: ['required'],
        },
        {
          name: 'status',
          type: { name: 'string', nullable: false },
          defaultValue: { kind: 'string', value: 'todo' },
          modifiers: ['required'],
        },
        {
          name: 'priority',
          type: { name: 'number', nullable: false },
          defaultValue: { kind: 'number', value: 1 },
          modifiers: ['optional'],
        },
      ],
      computedProperties: [
        {
          name: 'isHighPriority',
          type: { name: 'boolean', nullable: false },
          expression: {
            kind: 'binary',
            operator: '>=',
            left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'priority' },
            right: { kind: 'literal', value: { kind: 'number', value: 3 } },
          },
          dependencies: ['priority'],
        },
      ],
      relationships: [
        {
          name: 'assignee',
          kind: 'belongsTo',
          target: 'User',
          foreignKey: { fields: ['assigneeId'] },
        },
      ],
      commands: ['updateStatus', 'assignTask'],
      constraints: [
        {
          name: 'validTitle',
          code: 'VALID_TITLE',
          expression: {
            kind: 'binary',
            operator: '!=',
            left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'title' },
            right: { kind: 'literal', value: { kind: 'string', value: '' } },
          },
          severity: 'block',
          message: 'Title cannot be empty',
        },
      ],
      policies: ['OnlyCreator'],
      defaultPolicies: [],
      key: ['id'],
    },
  ],
  stores: [
    {
      entity: 'Task',
      target: 'memory',
      config: {},
    },
  ],
  events: [
    {
      name: 'TaskStatusUpdated',
      channel: 'tasks.updated',
      payload: [
        { name: 'id', type: { name: 'string', nullable: false }, required: true },
        { name: 'newStatus', type: { name: 'string', nullable: false }, required: true },
      ],
    },
  ],
  commands: [
    {
      name: 'updateStatus',
      entity: 'Task',
      parameters: [
        {
          name: 'newStatus',
          type: { name: 'string', nullable: false },
          required: true,
        },
      ],
      guards: [
        {
          kind: 'binary',
          operator: '!=',
          left: { kind: 'identifier', name: 'newStatus' },
          right: { kind: 'literal', value: { kind: 'string', value: '' } },
        },
      ],
      actions: [
        {
          kind: 'mutate',
          target: 'status',
          expression: { kind: 'identifier', name: 'newStatus' },
        },
      ],
      emits: ['TaskStatusUpdated'],
      policies: ['OnlyCreator'],
    },
    {
      name: 'assignTask',
      entity: 'Task',
      parameters: [
        {
          name: 'userId',
          type: { name: 'string', nullable: false },
          required: true,
        },
      ],
      guards: [],
      actions: [
        {
          kind: 'mutate',
          target: 'assigneeId',
          expression: { kind: 'identifier', name: 'userId' },
        },
      ],
      emits: [],
      policies: [],
    },
  ],
  policies: [
    {
      name: 'OnlyCreator',
      entity: 'Task',
      action: 'execute',
      expression: {
        kind: 'binary',
        operator: '==',
        left: { kind: 'member', object: { kind: 'identifier', name: 'user' }, property: 'id' },
        right: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'creatorId' },
      },
      message: 'Only the creator can modify this task',
    },
  ],
};

describe('docsCommand', () => {
  let tempDir: string;
  let originalCwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-docs-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined as any;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('generates HTML documentation from IR file', async () => {
    // Write sample IR to temp dir
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-output');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    // Verify index was generated
    const indexHtml = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Manifest API Reference');
    expect(indexHtml).toContain('Task');
    expect(indexHtml).toContain('Task.html');

    // Verify entity page was generated
    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('Task');
    expect(taskHtml).toContain('title');
    expect(taskHtml).toContain('status');
    expect(taskHtml).toContain('priority');
  });

  it('generates markdown documentation from IR file', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-md');
    await docsCommand('app.ir.json', { output: outputDir, format: 'markdown' });

    // Verify index
    const indexMd = await fs.readFile(path.join(outputDir, 'index.md'), 'utf-8');
    expect(indexMd).toContain('# Manifest API Reference');
    expect(indexMd).toContain('[Task]');

    // Verify entity page
    const taskMd = await fs.readFile(path.join(outputDir, 'Task.md'), 'utf-8');
    expect(taskMd).toContain('# Task');
    expect(taskMd).toContain('## Properties');
    expect(taskMd).toContain('`title`');
    expect(taskMd).toContain('`status`');
  });

  it('includes property tables with types and modifiers', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-props');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('string');
    expect(taskHtml).toContain('number');
    expect(taskHtml).toContain('required');
    expect(taskHtml).toContain('optional');
    // Default values
    expect(taskHtml).toContain('&quot;todo&quot;');
  });

  it('includes computed properties section', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-computed');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('Computed Properties');
    expect(taskHtml).toContain('isHighPriority');
    expect(taskHtml).toContain('boolean');
  });

  it('includes command signatures with parameters and guards', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-cmds');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('Commands');
    expect(taskHtml).toContain('updateStatus');
    expect(taskHtml).toContain('assignTask');
    expect(taskHtml).toContain('newStatus');
    expect(taskHtml).toContain('Guards');
  });

  it('includes policy rules', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-policies');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('Policies');
    expect(taskHtml).toContain('OnlyCreator');
    expect(taskHtml).toContain('execute');
  });

  it('includes constraint details', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-constraints');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('Constraints');
    expect(taskHtml).toContain('validTitle');
    expect(taskHtml).toContain('VALID_TITLE');
    expect(taskHtml).toContain('block');
    expect(taskHtml).toContain('Title cannot be empty');
  });

  it('includes events section', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-events');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('Events');
    expect(taskHtml).toContain('TaskStatusUpdated');
    expect(taskHtml).toContain('tasks.updated');
  });

  it('includes relationships section', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-rels');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('Relationships');
    expect(taskHtml).toContain('assignee');
    expect(taskHtml).toContain('belongsTo');
    expect(taskHtml).toContain('User');
  });

  it('includes store information', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-store');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const taskHtml = await fs.readFile(path.join(outputDir, 'Task.html'), 'utf-8');
    expect(taskHtml).toContain('memory');
  });

  it('uses custom title', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-title');
    await docsCommand('app.ir.json', { output: outputDir, title: 'My App Docs' });

    const indexHtml = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('My App Docs');
  });

  it('generates summary table in index', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'docs-summary');
    await docsCommand('app.ir.json', { output: outputDir, format: 'html' });

    const indexHtml = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Summary');
    expect(indexHtml).toContain('Entities');
    expect(indexHtml).toContain('Commands');
    expect(indexHtml).toContain('Policies');
  });

  it('fails gracefully when source not found', async () => {
    await docsCommand('nonexistent.ir.json', { output: path.join(tempDir, 'out') });

    expect(process.exitCode).toBe(1);
  });

  it('fails gracefully when no source provided', async () => {
    await docsCommand(undefined, { output: path.join(tempDir, 'out') });

    expect(process.exitCode).toBe(1);
  });

  it('handles directory input with IR files', async () => {
    const subDir = path.join(tempDir, 'ir-files');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, 'app.ir.json'),
      JSON.stringify(SAMPLE_IR, null, 2),
      'utf-8'
    );

    const outputDir = path.join(tempDir, 'docs-dir');
    await docsCommand(subDir, { output: outputDir });

    const indexHtml = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Task');
  });

  it('creates output directory if it does not exist', async () => {
    const irPath = path.join(tempDir, 'app.ir.json');
    await fs.writeFile(irPath, JSON.stringify(SAMPLE_IR, null, 2), 'utf-8');

    const outputDir = path.join(tempDir, 'nested', 'deep', 'docs');
    await docsCommand('app.ir.json', { output: outputDir });

    const stat = await fs.stat(outputDir);
    expect(stat.isDirectory()).toBe(true);
  });
});
