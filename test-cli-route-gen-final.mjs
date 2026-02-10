import { generateCommand } from './packages/cli/src/commands/generate.js';

console.error('Testing with correct import paths for capsule-pro');

const options = {
  projection: 'nextjs',
  surface: 'route',
  output: '../capsule-pro/apps/api',
  auth: '@repo/auth/server',  // Correct auth import
  database: '@repo/database',  // Correct database import
  runtime: '@repo/kitchen-ops',
  response: '@/lib/manifest-response',
};

await generateCommand('../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json', options);

console.error('Done! Check: apps/api/app/api/preptask/route.ts');
