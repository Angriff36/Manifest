import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

const HASH_PREFIX = '#code=';

export function encodeSource(source: string): string {
  return HASH_PREFIX + compressToEncodedURIComponent(source);
}

export function decodeSource(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const compressed = hash.slice(HASH_PREFIX.length);
  if (!compressed) return null;
  return decompressFromEncodedURIComponent(compressed);
}

export function updateUrl(source: string): void {
  const hash = encodeSource(source);
  history.replaceState(null, '', hash);
}

export function readSourceFromUrl(): string | null {
  return decodeSource(window.location.hash);
}
