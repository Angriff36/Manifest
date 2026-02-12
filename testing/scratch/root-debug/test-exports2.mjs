import { NextJsProjection } from './src/manifest/projections/nextjs/generator.js';
console.error('NextJsProjection imported:', typeof NextJsProjection);
const proj = new NextJsProjection({});
console.error('Instance created:', typeof proj);
console.error('Has generate?', typeof proj.generate);
