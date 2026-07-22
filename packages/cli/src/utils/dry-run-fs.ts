/**
 * Shared filesystem writes for Manifest CLI `--dry-run`.
 *
 * When dryRun is true: log what would be written and skip disk mutation.
 * When false: write for real (mkdir parents as needed).
 */

import fs from 'node:fs/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export interface DryRunWriteOptions {
  dryRun?: boolean;
  /** Override cwd used for relative path display (default: process.cwd()). */
  cwd?: string;
}

function displayPath(absPath: string, cwd: string): string {
  const rel = path.relative(cwd, absPath);
  return (rel && !rel.startsWith('..') ? rel : absPath).replace(/\\/g, '/');
}

function byteLength(content: string | Buffer | Uint8Array): number {
  if (typeof content === 'string') return Buffer.byteLength(content, 'utf-8');
  return content.byteLength;
}

export function logWouldWrite(absPath: string, bytes: number, cwd: string = process.cwd()): void {
  console.log(
    chalk.cyan(`dry-run: would write ${displayPath(absPath, cwd)} (${bytes} bytes)`),
  );
}

export function logWouldMkdir(absPath: string, cwd: string = process.cwd()): void {
  console.log(chalk.cyan(`dry-run: would mkdir ${displayPath(absPath, cwd)}`));
}

export function logWouldApply(summary: string): void {
  console.log(chalk.cyan(`dry-run: would apply ${summary}`));
}

/** Reject combining --dry-run with --check (different jobs). */
export function assertDryRunCheckExclusive(options: {
  dryRun?: boolean;
  check?: boolean;
}): void {
  if (options.dryRun && options.check) {
    throw new Error('Cannot combine --dry-run with --check (different jobs). Use one.');
  }
}

export async function ensureDir(
  dirPath: string,
  options: DryRunWriteOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const abs = path.resolve(cwd, dirPath);
  if (options.dryRun) {
    logWouldMkdir(abs, cwd);
    return;
  }
  await fs.mkdir(abs, { recursive: true });
}

export async function writeTextFile(
  filePath: string,
  content: string,
  options: DryRunWriteOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const abs = path.resolve(cwd, filePath);
  const bytes = byteLength(content);
  if (options.dryRun) {
    logWouldWrite(abs, bytes, cwd);
    return;
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
}

export async function writeBinaryFile(
  filePath: string,
  content: Buffer | Uint8Array,
  options: DryRunWriteOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const abs = path.resolve(cwd, filePath);
  const bytes = byteLength(content);
  if (options.dryRun) {
    logWouldWrite(abs, bytes, cwd);
    return;
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

/** Sync variant for commands that still use writeFileSync (e.g. db-init --out). */
export function writeTextFileSync(
  filePath: string,
  content: string,
  options: DryRunWriteOptions = {},
): void {
  const cwd = options.cwd ?? process.cwd();
  const abs = path.resolve(cwd, filePath);
  const bytes = byteLength(content);
  if (options.dryRun) {
    logWouldWrite(abs, bytes, cwd);
    return;
  }
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
}
