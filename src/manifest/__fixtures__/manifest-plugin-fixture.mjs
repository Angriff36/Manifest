/**
 * Test fixture: a valid Manifest plugin exercising every extension point that
 * activation needs to prove out — a builtin function, a custom store adapter,
 * a CLI command, and an audit sink.
 *
 * Plain `.mjs` (no imports) so it can be dynamic-imported by the loader both
 * in-process (runtime composition test) and from a child-process CLI (the CLI
 * activation test copies it into a temp project). It is not TypeScript on
 * purpose: nothing here needs typechecking, and keeping it dependency-free
 * means it resolves the same way a real published plugin would.
 *
 * `manifestVersion: '>=0.0.0'` so the loader's SemVer compat check passes
 * against whatever the actual package version is.
 */

/** In-memory Store implementation, tagged so tests can prove it came from here. */
function createRedisLikeStore(entityName) {
  const rows = new Map();
  let seq = 0;
  return {
    async getAll() {
      return [...rows.values()];
    },
    async getById(id) {
      return rows.get(id);
    },
    async create(data) {
      const id = data.id ?? `redis-${entityName}-${++seq}`;
      const row = { ...data, id };
      rows.set(id, row);
      return row;
    },
    async update(id, data) {
      const existing = rows.get(id);
      if (!existing) return undefined;
      const row = { ...existing, ...data, id };
      rows.set(id, row);
      return row;
    },
    async delete(id) {
      return rows.delete(id);
    },
    async clear() {
      rows.clear();
    },
  };
}

const plugin = {
  manifest: {
    name: 'manifest-plugin-fixture',
    version: '1.0.0',
    pluginApiVersion: '1',
    manifestVersion: '>=0.0.0',
    description: 'Fixture plugin for activation tests',
  },
  builtins: [
    {
      name: 'double',
      purity: 'pure',
      arity: 1,
      fn: (x) => (typeof x === 'number' ? x * 2 : x),
    },
  ],
  storeAdapters: [
    {
      scheme: 'redis',
      createStore: (entityName) => createRedisLikeStore(entityName),
    },
  ],
  auditSinks: [
    {
      id: 'fixture-audit',
      createSink: () => ({
        records: [],
        async emit(record) {
          this.records.push(record);
        },
      }),
    },
  ],
  cliCommands: [
    {
      name: 'greet',
      register(program) {
        program
          .command('greet')
          .description('Greet from the fixture plugin')
          .action(() => {
            console.log('hello from fixture plugin');
          });
      },
    },
  ],
};

export default plugin;
