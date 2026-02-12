export function generate(input: any, _options: any) {
  const output: string[] = [];

  if (input.entities) {
    for (const entity of input.entities) {
      output.push(`Entity: ${entity.name}`);

      if (entity.properties) {
        for (const prop of entity.properties) {
          output.push(`  Property type: ${prop.type}`);
        }
      }
    }
  }

  if (input.metadata) {
    output.push(`Version: ${input.metadata.version}`);
  }

  return output;
}
