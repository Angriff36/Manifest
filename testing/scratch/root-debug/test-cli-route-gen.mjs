import { generateCommand } from './packages/cli/src/commands/generate.js';

console.error('Starting CLI route generation test...');

const options = {
  projection: 'nextjs',
  surface: 'route',
  output: '../capsule-pro/apps/api/app',
  auth: 'clerk',
  database: '@/lib/database',
  runtime: '@repo/kitchen-ops',
  response: '@repo/kitchen-ops/api-response',
};

console.error('Options:', JSON.stringify(options, null, 2));

await generateCommand('../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json', options);

console.error('CLI route generation complete!');
