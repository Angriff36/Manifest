/**
 * manifest pack / unpack commands
 *
 * Convert IR between JSON and the binary MessagePack `.mir` format.
 *
 *   manifest pack   <input.ir.json> [-o output.mir]
 *   manifest unpack <input.mir>      [-o output.ir.json]
 *
 * Binary IR is typically 40-60% smaller than JSON and parses significantly
 * faster, at the cost of human readability. Use it for storage and
 * transport, not editing.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

async function loadBinaryIR() {
  const module = await import('@angriff36/manifest/binary-ir');
  return {
    packIR: module.packIR,
    unpackIR: module.unpackIR,
    inspectBinaryIR: module.inspectBinaryIR,
    compareSizes: module.compareSizes,
    deriveMirPath: module.deriveMirPath,
    deriveJsonPath: module.deriveJsonPath,
    MIR_EXTENSION: module.MIR_EXTENSION,
    BinaryIRError: module.BinaryIRError,
  };
}

interface PackOptions {
  output?: string;
  pretty?: boolean;
}

interface UnpackOptions {
  output?: string;
  pretty?: boolean;
}

/**
 * `manifest pack` — convert a JSON IR file to a binary `.mir` file.
 */
export async function packCommand(
  input: string,
  options: PackOptions = {}
): Promise<void> {
  const resolvedInput = path.resolve(process.cwd(), input);

  let raw: string;
  try {
    raw = await fs.readFile(resolvedInput, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: cannot read input file ${resolvedInput}: ${msg}`));
    process.exit(1);
  }

  let ir: unknown;
  try {
    ir = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: input is not valid JSON: ${msg}`));
    process.exit(1);
  }

  const { packIR, compareSizes, deriveMirPath, MIR_EXTENSION } = await loadBinaryIR();

  const outputPath = options.output
    ? path.resolve(process.cwd(), options.output)
    : deriveMirPath(resolvedInput);

  const buf = packIR(ir as Parameters<typeof packIR>[0]);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buf);

  const stats = compareSizes(ir as Parameters<typeof compareSizes>[0]);

  console.log(chalk.green(`Packed ${path.relative(process.cwd(), resolvedInput)} → ${path.relative(process.cwd(), outputPath)}`));
  console.log(chalk.gray(`  JSON:  ${stats.jsonBytes} bytes`));
  console.log(chalk.gray(`  Binary: ${stats.binaryBytes} bytes (${stats.savingsPercent}% smaller)`));
  if (!outputPath.endsWith(MIR_EXTENSION)) {
    console.log(chalk.yellow(`  Note: output does not end in ${MIR_EXTENSION} — consider renaming for consistency`));
  }
}

/**
 * `manifest unpack` — convert a binary `.mir` file back to JSON.
 */
export async function unpackCommand(
  input: string,
  options: UnpackOptions = {}
): Promise<void> {
  const resolvedInput = path.resolve(process.cwd(), input);

  let buf: Uint8Array;
  try {
    buf = new Uint8Array(await fs.readFile(resolvedInput));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: cannot read input file ${resolvedInput}: ${msg}`));
    process.exit(1);
  }

  const { unpackIR, inspectBinaryIR, deriveJsonPath, BinaryIRError } = await loadBinaryIR();

  let ir: unknown;
  try {
    ir = unpackIR(buf);
  } catch (err) {
    if (err instanceof BinaryIRError) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
    throw err;
  }

  const info = inspectBinaryIR(buf);

  const outputPath = options.output
    ? path.resolve(process.cwd(), options.output)
    : deriveJsonPath(resolvedInput);

  const indent = options.pretty === false ? undefined : 2;
  const json = indent !== undefined
    ? JSON.stringify(ir, null, indent)
    : JSON.stringify(ir);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, json, 'utf-8');

  console.log(chalk.green(`Unpacked ${path.relative(process.cwd(), resolvedInput)} → ${path.relative(process.cwd(), outputPath)}`));
  console.log(chalk.gray(`  Format version: ${info.formatVersion}`));
  console.log(chalk.gray(`  Payload:        ${info.payloadSize} bytes`));
  console.log(chalk.gray(`  Total:          ${info.totalSize} bytes`));
}
