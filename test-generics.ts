import { compileToIR } from './src/manifest/ir-compiler';

const manifest = `
entity Paginated<T> {
  property page: number = 0
  property items: T = ""
}

entity Item {
  property id: string = ""
}

entity ItemList = Paginated<Item> {
  property category: string = ""
}
`;

(async () => {
  const { ir, diagnostics } = await compileToIR(manifest);
  console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
  console.log('IR:', ir ? 'Generated' : 'null');
})();
