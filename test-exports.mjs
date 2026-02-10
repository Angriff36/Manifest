import m from './src/manifest/projections/nextjs/generator.js';
console.error('Export keys:', Object.keys(m));
console.error('Has NextJsProjection?', 'NextJsProjection' in m);
console.error('Has default?', 'default' in m);
console.error('Module itself:', typeof m);
console.error('Module.NextJsProjection?', typeof m.NextJsProjection);
