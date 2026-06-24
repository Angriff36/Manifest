export async function loadCompiler() {
  const module = await import('@angriff36/manifest/ir-compiler');
  return {
    compileToIR: module.compileToIR,
    validateCommandIntentRegistry: module.validateCommandIntentRegistry,
  };
}
