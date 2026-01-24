export interface FileNode {
  name: string;
  path: string;
  content: string;
  type: 'file';
}

export interface FolderNode {
  name: string;
  path: string;
  type: 'folder';
  children: (FileNode | FolderNode)[];
}

export type TreeNode = FileNode | FolderNode;

export interface ProjectFiles {
  source: string;
  clientCode: string;
  serverCode: string;
  testCode: string;
  ast: object | null;
}

export interface SmokeTestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface SmokeTestReport {
  total: number;
  passed: number;
  failed: number;
  results: SmokeTestResult[];
  duration: number;
}
