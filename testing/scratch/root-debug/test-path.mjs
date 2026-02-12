import path from 'path';

const outputDir = '../capsule-pro/apps/api';
const pathHint = 'app/api/preptask/route.ts';

console.log('outputDir:', outputDir);
console.log('pathHint:', pathHint);
console.log('resolve:', path.resolve(outputDir, pathHint));

const cwd = process.cwd();
console.log('cwd:', cwd);
console.log('resolved outputDir:', path.resolve(cwd, outputDir));
