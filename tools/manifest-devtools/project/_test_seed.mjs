import { compileToIR } from '../../../dist/manifest/ir-compiler.js';
import { RuntimeEngine } from '../../../dist/manifest/runtime-engine.js';
import fs from 'fs';

const source = fs.readFileSync('C:/Projects/capsule-pro/packages/manifest-adapters/manifests/command-board-rules.manifest', 'utf-8');
const { ir } = await compileToIR(source, 'command-board-rules.manifest');

const context = { user: { id: 'test-user-1', role: 'admin', name: 'Test Admin' }, tenant: 'test-tenant-1' };
const engine = new RuntimeEngine(ir, context, { deterministicMode: true, requireValidProvenance: false });

// Build IR defaults for CommandBoardCard (excluding id/required props to avoid overwriting)
const entity = ir.entities.find(e => e.name === 'CommandBoardCard');
const defaults = {};
for (const prop of entity.properties) {
  // Skip 'required' props — those should be set explicitly
  if (prop.required) continue;
  if (prop.defaultValue) {
    defaults[prop.name] = prop.defaultValue.value !== undefined ? prop.defaultValue.value : null;
  } else {
    const typeName = prop.type?.name || prop.type;
    switch (typeName) {
      case 'string': defaults[prop.name] = ''; break;
      case 'number': defaults[prop.name] = 0; break;
      case 'boolean': defaults[prop.name] = false; break;
      default: defaults[prop.name] = null;
    }
  }
}

// Seed via store.create — id MUST come last to not be overwritten
const store = engine.getStore('CommandBoardCard');
const seedData = { ...defaults, id: 'card-1', tenantId: 'test-tenant', boardId: 'board-1' };
console.log('Seed data id:', seedData.id);
const created = await store.create(seedData);
console.log('store.create id:', created.id, 'deletedAt:', created.deletedAt);

// Verify
const check = await engine.getInstance('CommandBoardCard', 'card-1');
console.log('getInstance after seed:', check ? 'FOUND' : 'NOT FOUND');

// Run create command
const r1 = await engine.runCommand('create', {
  boardId: 'board-1', title: 'Test Card', content: 'content',
  cardType: 'task', status: 'pending',
  positionX: 10, positionY: 10, width: 200, height: 150,
  color: 'blue', metadata: '{}', groupId: '', entityId: '', entityType: ''
}, { entityName: 'CommandBoardCard', instanceId: 'card-1' });
console.log('create:', r1.success ? 'OK' : 'FAILED', r1.error || '');

const afterCreate = await engine.getInstance('CommandBoardCard', 'card-1');
console.log('After create - deletedAt:', afterCreate?.deletedAt, '| status:', afterCreate?.status);

// Run sequence
const steps = [
  { name: 'update', params: { newTitle: 'Updated', newContent: 'c2', newCardType: 'task', newStatus: 'pending', newColor: 'red', newMetadata: '{}', newGroupId: '' } },
  { name: 'move', params: { newPositionX: 20, newPositionY: 20, newZIndex: 1 } },
  { name: 'resize', params: { newWidth: 300, newHeight: 200 } },
  { name: 'remove', params: { userId: 'user-1' } },
];

for (const cmd of steps) {
  const r = await engine.runCommand(cmd.name, cmd.params, { entityName: 'CommandBoardCard', instanceId: 'card-1' });
  const inst = await engine.getInstance('CommandBoardCard', 'card-1');
  console.log(`${cmd.name}: ${r.success ? 'OK' : 'FAILED'} ${r.error || ''} | deletedAt=${inst?.deletedAt}`);
  if (r.guardFailure) console.log('  guard resolved:', JSON.stringify(r.guardFailure.resolved));
}
