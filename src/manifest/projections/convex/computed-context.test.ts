import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { resolve } from 'node:path';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './generator.js';

const SOURCE = `
role Crew { allow read Event }
role Manager extends Crew { allow write Event }
entity Event {
  property ownerId: string = ""
  hasMany assignments: Assignment
  computed canManage: boolean = roleAllows(user.role, "write", "Event")
  computed isOwner: boolean = user.id == self.ownerId
  computed region: string = context.region
  computed editableAssignments: number = count_of(self.assignments, (row) => row.canEdit)
}
entity Assignment {
  property eventId: string
  property ownerId: string = ""
  belongsTo event: Event fields [eventId] references [id]
  computed canEdit: boolean = user.id == self.ownerId and roleAllows(user.role, "read", "Event")
}
entity PublicSummary {
  computed label: string = "user context checkRole("
  computed managerCanRead: boolean = roleAllows("Manager", "read", "Event")
  computed managerCanReadOther: boolean = roleAllows("Manager", "read", "Other")
}
store Event in durable
store Assignment in durable
store PublicSummary in durable
`;

async function generate(surface: 'convex.computed' | 'convex.queries', source = SOURCE) {
  const compiled = await compileToIR(source);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(compiled.ir).not.toBeNull();
  return new ConvexProjection().generate(compiled.ir!, {
    surface,
    options: { computedProperties: 'inline', authContextImport: './auth' },
  });
}

function strictDiagnostics(source: string): string[] {
  const filename = resolve('computed-context-generated.ts');
  const content = source.replace(
    /import type \{ Doc \} from "\.\/_generated\/dataModel";/,
    'type Doc<T extends string> = Record<string, any>;',
  );
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const getSource = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, fresh) =>
    resolve(name) === filename
      ? ts.createSourceFile(name, content, version, true)
      : getSource(name, version, onError, fresh);
  return ts
    .getPreEmitDiagnostics(ts.createProgram([filename], options, host))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

function load(source: string, auth: Record<string, unknown> = {}): Record<string, any> {
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const requireGenerated = (name: string) => {
    if (name === './auth') return { getAuthContext: async () => auth };
    if (name === './_generated/server')
      return {
        query: (definition: unknown) => definition,
        internalQuery: (definition: unknown) => definition,
      };
    if (name === 'convex/values') return { v: new Proxy({}, { get: () => () => ({}) }) };
    throw new Error(`Unexpected generated import: ${name}`);
  };
  new Function('exports', 'require', js)(exports, requireGenerated);
  return exports;
}

function database() {
  const event = { _id: 'event', ownerId: 'person-a' };
  const assignments = [
    { _id: 'first', eventId: 'event', ownerId: 'person-a' },
    { _id: 'second', eventId: 'event', ownerId: 'person-b' },
  ];
  return {
    db: {
      get: async (id: string) => (id === 'event' ? { ...event } : null),
      query: (table: string) => {
        const query = {
          withIndex: () => query,
          filter: () => query,
          collect: async () => structuredClone(table === 'events' ? [event] : assignments),
        };
        return query;
      },
    },
  };
}

describe('Convex computed evaluation context', () => {
  it('emits standalone helpers that typecheck and evaluate caller-supplied user and context', async () => {
    const result = await generate('convex.computed');
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const code = result.artifacts[0]!.code;
    expect(strictDiagnostics(code)).toEqual([]);
    const helpers = load(code);
    const doc = { ownerId: 'person-a', assignments: [] };
    expect(
      helpers.computeEvent(
        { ...doc },
        {
          user: { id: 'person-a', role: 'Manager' },
          context: { region: 'west' },
        },
      ),
    ).toMatchObject({ canManage: true, isOwner: true, region: 'west' });
    expect(
      helpers.computeEvent(
        { ...doc },
        {
          user: { id: 'person-b', role: 'Crew' },
          context: { region: 'east' },
        },
      ),
    ).toMatchObject({ canManage: false, isOwner: false, region: 'east' });
    expect(() => helpers.computeEvent({ ...doc })).toThrow();
    expect(() => helpers.computeEvent({ ...doc }, { context: { region: 'west' } })).toThrow();
    expect(helpers.computePublicSummary({})).toEqual({
      label: 'user context checkRole(',
      managerCanRead: true,
      managerCanReadOther: false,
    });
  });

  it('passes evaluation context into materialization of related computed fields', async () => {
    const helpers = load((await generate('convex.computed')).artifacts[0]!.code);
    const context = { user: { id: 'person-a', role: 'Crew' }, context: { region: 'west' } };
    const event = { _id: 'event', ownerId: 'person-a' };
    await helpers.hydrateComputedRelationsForEvent(database(), event, context);
    expect(helpers.computeEvent(event, context)).toMatchObject({ editableAssignments: 1 });
  });

  it('binds user and context used only by a related computed field', async () => {
    const source = `
entity Event {
  hasMany assignments: Assignment
  computed editableAssignments: number = count_of(self.assignments, (row) => row.canEdit)
}
entity Assignment {
  property eventId: string
  property ownerId: string = ""
  belongsTo event: Event fields [eventId] references [id]
  computed canEdit: boolean = user.id == self.ownerId and context.region == "west"
}
store Event in durable
store Assignment in durable
`;
    const context = { user: { id: 'person-a' }, context: { region: 'west' } };
    const helpers = load((await generate('convex.computed', source)).artifacts[0]!.code);
    const event = { _id: 'event' };
    await helpers.hydrateComputedRelationsForEvent(database(), event, context);
    expect(helpers.computeEvent(event)).toEqual({ editableAssignments: 1 });
    const queries = load((await generate('convex.queries', source)).artifacts[0]!.code, context);
    expect(await queries.getEvent.handler(database(), { id: 'event' })).toMatchObject({
      editableAssignments: 1,
    });
  });

  it('diagnoses a missing inline auth seam and rejects execution instead of inventing context', async () => {
    const compiled = await compileToIR(SOURCE);
    const result = new ConvexProjection().generate(compiled.ir!, {
      surface: 'convex.queries',
      options: { computedProperties: 'inline' },
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'CONVEX_AUTH_CONTEXT_REQUIRED',
          entity: 'Event',
        }),
      ]),
    );
    const queries = load(result.artifacts[0]!.code);
    await expect(queries.getEvent.handler(database(), { id: 'event' })).rejects.toThrow(
      'CONVEX_AUTH_CONTEXT_REQUIRED',
    );
  });

  it.each([
    ['', 'public reads'],
    ['policy Visible read: self.ownerId != "hidden" "Visible event"', 'row-only policy'],
    ['policy Visible read: context.region == "west" "Allowed region"', 'context-only policy'],
  ])('binds computed context for %s (%s)', async (policy) => {
    const result = await generate('convex.queries', `${SOURCE}\n${policy}`);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const queries = load(result.artifacts[0]!.code, {
      user: { id: 'person-a', role: 'Manager' },
      context: { region: 'west' },
    });
    const expected = { canManage: true, isOwner: true, region: 'west', editableAssignments: 1 };
    expect(await queries.getEvent.handler(database(), { id: 'event' })).toMatchObject(expected);
    expect(await queries.listEvent.handler(database(), {})).toEqual([
      expect.objectContaining(expected),
    ]);
  });
});
