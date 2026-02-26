const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getManifestRoot: () => ipcRenderer.invoke('get-manifest-root'),
  setManifestRoot: (root) => ipcRenderer.invoke('set-manifest-root', { root }),
  getCliPath: () => ipcRenderer.invoke('get-cli-path'),
  setCliPath: (cliPath) => ipcRenderer.invoke('set-cli-path', { cliPath }),
  getManifestRepoRoot: () => ipcRenderer.invoke('get-manifest-repo-root'),
  setManifestRepoRoot: (repoRoot) => ipcRenderer.invoke('set-manifest-repo-root', { repoRoot }),
  validateCliPath: (cliPath) => ipcRenderer.invoke('validate-cli-path', { cliPath }),
  listFiles: (root) => ipcRenderer.invoke('list-files', { root }),
  readFile: (filePath) => ipcRenderer.invoke('read-file', { filePath }),
  compileFile: (filePath) => ipcRenderer.invoke('compile-file', { filePath }),
  compileAll: (root) => ipcRenderer.invoke('compile-all', { root }),
  scanFile: (filePath) => ipcRenderer.invoke('scan-file', { filePath }),
  scanAll: (root) => ipcRenderer.invoke('scan-all', { root }),
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  profileCompile: (root) => ipcRenderer.invoke('profile-compile', { root }),
  profileRuntime: (opts) => ipcRenderer.invoke('profile-runtime', opts),
  profileStatic: (root) => ipcRenderer.invoke('profile-static', { root }),
  // --- IR Schema Validation ---
  validateIR: (root) => ipcRenderer.invoke('validate-ir', { root }),
  // --- IR Diff ---
  diffIR: (opts) => ipcRenderer.invoke('diff-ir', opts),
  // --- IR Structure ---
  getIRStructure: (filePath) => ipcRenderer.invoke('get-ir-structure', { filePath }),
  // --- Test Harness ---
  runTestScript: (opts) => ipcRenderer.invoke('run-test-script', opts),
  validateTestScript: (script) => ipcRenderer.invoke('validate-test-script', { script }),
});
