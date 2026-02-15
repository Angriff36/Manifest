// API client for DevTools backend
const API_BASE = 'http://localhost:3001/api';

export interface ScanResult {
  errors: Array<{
    file: string;
    line?: number;
    entityName: string;
    commandName: string;
    message: string;
    suggestion: string;
  }>;
  warnings: Array<{
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  filesScanned: number;
  commandsChecked: number;
  routesScanned: number;
}

export interface ManifestFile {
  path: string;
  relative: string;
  name: string;
}

export async function scanFile(filePath: string): Promise<ScanResult> {
  const response = await fetch(`${API_BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  
  if (!response.ok) {
    throw new Error(`Scan failed: ${response.statusText}`);
  }
  
  return response.json();
}

export async function scanAll(): Promise<ScanResult> {
  const response = await fetch(`${API_BASE}/scan-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (!response.ok) {
    throw new Error(`Scan failed: ${response.statusText}`);
  }
  
  return response.json();
}

export async function listFiles(): Promise<{ files: ManifestFile[]; root: string }> {
  const response = await fetch(`${API_BASE}/files`);
  
  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.statusText}`);
  }
  
  return response.json();
}

export async function readFile(filePath: string): Promise<{ content: string; path: string }> {
  const response = await fetch(`${API_BASE}/files/${encodeURIComponent(filePath)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to read file: ${response.statusText}`);
  }
  
  return response.json();
}

export async function checkHealth(): Promise<{ status: string; manifestRoot: string }> {
  const response = await fetch(`${API_BASE}/health`);
  
  if (!response.ok) {
    throw new Error('API server not available');
  }
  
  return response.json();
}
