import path from 'path';
const outputDir = '../capsule-pro/apps/api/app';
const pathHint = 'app/api/preptask/route.ts';
const cwd = process.cwd();
const resolvedOutput = path.resolve(cwd, outputDir);
const finalResult = path.resolve(resolvedOutput, pathHint);

console.error('cwd:', cwd);
console.error('outputDir:', outputDir);
console.error('resolved outputDir:', resolvedOutput);
console.error('pathHint:', pathHint);
console.error('final result:', finalResult);

// What we actually want
const target = 'C:/Projects/capsule-pro/apps/api/app/api/preptask/route.ts';
console.error('target:', target);
console.error('match?', finalResult === target);
