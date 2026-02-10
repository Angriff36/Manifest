import { generateCommand } from './packages/cli/src/commands/generate.js';

// Simulate CLI call
const options = {
  projection: 'nextjs',
  surface: 'route',
  output: '../capsule-pro/apps/api',
  auth: 'clerk',
  database: '@/lib/database',
  runtime: '@repo/kitchen-ops',
  response: '@repo/kitchen-ops/api-response',
};

console.error('Calling generateCommand with options:');
console.error(JSON.stringify(options, null, 2));

await generateCommand('../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json', options);
