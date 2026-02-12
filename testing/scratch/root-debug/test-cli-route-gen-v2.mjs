import { generateCommand } from './packages/cli/src/commands/generate.js';

console.error('Testing with output: ../capsule-pro/apps/api');

const options = {
  projection: 'nextjs',
  surface: 'route',
  output: '../capsule-pro/apps/api',
  auth: 'clerk',
  database: '@/lib/database',
  runtime: '@repo/kitchen-ops',
  response: '@repo/kitchen-ops/api-response',
};

await generateCommand('../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json', options);

console.error('Done!');
