import { readFileSync, writeFileSync } from 'fs';
const irPath = '../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json';
const content = readFileSync(irPath, 'utf-8');
const ir = JSON.parse(content);
writeFileSync('test-debug.txt', `Entities: ${ir.entities?.length}\nNames: ${ir.entities?.map(e => e.name).join(', ')}\n`);
console.error('Done!');
