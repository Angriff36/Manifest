// Test setup for vitest
import { loadEnv } from 'vite';

// Load .env without overriding shell/CI (DATABASE_URL, CAPSULE_TEST_DATABASE_URL, …)
const fromFile = loadEnv('', process.cwd(), '');
for (const [key, value] of Object.entries(fromFile)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

// Mock localStorage for Node.js test environment

class LocalStorageMock {
  private store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this.store).length;
  }

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }
}

// @ts-expect-error - global.localStorage is not defined in Node.js
global.localStorage = new LocalStorageMock();
