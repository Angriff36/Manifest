import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const shared = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
};

// Extension client — runs in the VS Code extension host
const clientBuild = esbuild.build({
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  external: ['vscode'],
});

// LSP server — spawned as a child process by the client
const serverBuild = esbuild.build({
  ...shared,
  entryPoints: ['src/server/server.ts'],
  outfile: 'dist/server.js',
});

if (watch) {
  const ctx1 = await esbuild.context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
  });
  const ctx2 = await esbuild.context({
    ...shared,
    entryPoints: ['src/server/server.ts'],
    outfile: 'dist/server.js',
  });
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([clientBuild, serverBuild]);
}
