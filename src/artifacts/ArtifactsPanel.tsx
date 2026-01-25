import { useState, useEffect } from 'react';
import { Download, Copy, Check, Package, FolderTree, Rocket } from 'lucide-react';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { SmokeTestPanel } from './SmokeTestPanel';
import { buildFileMap, exportZip, exportRunnableZip, copyAllFiles, generateProjectName } from './zipExporter';
import { ProjectFiles } from './types';

interface ArtifactsPanelProps {
  source: string;
  clientCode: string;
  serverCode: string;
  testCode: string;
  ast: object | null;
  hasErrors: boolean;
}

export function ArtifactsPanel({
  source,
  clientCode,
  serverCode,
  testCode,
  ast,
  hasErrors
}: ArtifactsPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>('src/generated/client.ts');
  const [copiedAll, setCopiedAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingRunnable, setExportingRunnable] = useState(false);

  const files: ProjectFiles = {
    source,
    clientCode,
    serverCode,
    testCode,
    ast
  };

  const fileMap = buildFileMap(files);
  const projectName = generateProjectName(source);

  useEffect(() => {
    if (!selectedFile || !fileMap[selectedFile]) {
      setSelectedFile('src/generated/client.ts');
    }
  }, [fileMap, selectedFile]);

  const handleExport = async () => {
    if (hasErrors) return;
    setExporting(true);
    try {
      await exportZip(files);
    } finally {
      setExporting(false);
    }
  };

  const handleExportRunnable = async () => {
    if (hasErrors) return;
    setExportingRunnable(true);
    try {
      await exportRunnableZip(files);
    } finally {
      setExportingRunnable(false);
    }
  };

  const handleCopyAll = async () => {
    await copyAllFiles(files);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <div className="flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-sky-400" />
            <span className="text-sm font-medium text-gray-200">Artifacts</span>
            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-800 rounded">{projectName}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleExportRunnable}
            disabled={hasErrors || exportingRunnable}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded transition-colors ${
              hasErrors || exportingRunnable
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white'
            }`}
          >
            <Rocket size={14} />
            {exportingRunnable ? 'Exporting...' : 'Export Runnable Project'}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={hasErrors || exporting}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
                hasErrors || exporting
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              <Download size={14} />
              {exporting ? 'Exporting...' : 'Export .zip'}
            </button>
            <button
              onClick={handleCopyAll}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              {copiedAll ? (
                <>
                  <Check size={14} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy All</span>
                </>
              )}
            </button>
          </div>
        </div>
        {hasErrors && (
          <div className="mt-2 text-xs text-rose-400">
            Fix compilation errors to enable export
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-48 flex-shrink-0 border-r border-gray-800 overflow-auto">
          <div className="px-2 py-2 text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <FolderTree size={12} />
            Files
          </div>
          <FileTree
            files={fileMap}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFile && fileMap[selectedFile] ? (
            <FileViewer path={selectedFile} content={fileMap[selectedFile]} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select a file to view
            </div>
          )}
        </div>
      </div>

      <SmokeTestPanel
        clientCode={clientCode}
        ast={ast}
        disabled={hasErrors}
      />
    </div>
  );
}
