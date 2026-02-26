import { useState, useEffect } from 'react';
import { X, FolderOpen, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import {
  getCliPath,
  setCliPath,
  getManifestRepoRoot,
  setManifestRepoRoot,
  validateCliPath,
  pickDirectory,
} from '../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [repoRoot, setRepoRoot] = useState('');
  const [repoRootInput, setRepoRootInput] = useState('');
  const [cliPath, setCliPathState] = useState('');
  const [cliPathInput, setCliPathInput] = useState('');
  const [cliPathValid, setCliPathValid] = useState<boolean | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load current settings when modal opens
      Promise.all([getManifestRepoRoot(), getCliPath()]).then(
        ([savedRepoRoot, savedCliPath]) => {
          setRepoRoot(savedRepoRoot);
          setRepoRootInput(savedRepoRoot);
          setCliPathState(savedCliPath);
          setCliPathInput(savedCliPath);

          // Validate CLI path
          if (savedCliPath) {
            validateCliPath(savedCliPath)
              .then(({ valid }) => setCliPathValid(valid))
              .catch(() => setCliPathValid(false));
          }
        }
      );
    }
  }, [isOpen]);

  const handleValidateCliPath = async (path: string) => {
    setValidating(true);
    try {
      const { valid } = await validateCliPath(path);
      setCliPathValid(valid);
    } catch {
      setCliPathValid(false);
    } finally {
      setValidating(false);
    }
  };

  const handleRepoRootChange = (newRepoRoot: string) => {
    setRepoRootInput(newRepoRoot);
    // Auto-update CLI path based on repo root
    const autoCliPath = `${newRepoRoot}/packages/cli/bin/manifest.js`.replace(
      /\\/g,
      '/'
    );
    setCliPathInput(autoCliPath);
    handleValidateCliPath(autoCliPath);
  };

  const handleBrowseRepoRoot = async () => {
    const dir = await pickDirectory().catch(() => null);
    if (dir) {
      handleRepoRootChange(dir);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        setManifestRepoRoot(repoRootInput),
        setCliPath(cliPathInput),
      ]);
      setRepoRoot(repoRootInput);
      setCliPathState(cliPathInput);
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-light border border-surface-border rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-slate-100">
            DevTools Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-md hover:bg-surface-hover"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-4 flex gap-3">
            <AlertCircle size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-300">
              <p className="font-medium text-slate-200 mb-1">
                Configure Manifest CLI Path
              </p>
              <p className="text-slate-400">
                Set the path to your Manifest repository root. The CLI path will
                be automatically configured as{' '}
                <code className="text-xs bg-surface-lighter px-1 py-0.5 rounded">
                  &lt;repo&gt;/packages/cli/bin/manifest.js
                </code>
              </p>
            </div>
          </div>

          {/* Manifest Repo Root */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Manifest Repository Root
            </label>
            <p className="text-xs text-slate-400 mb-2">
              The root directory of the Manifest repository (contains packages/,
              dist/, etc.)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={repoRootInput}
                onChange={(e) => handleRepoRootChange(e.target.value)}
                placeholder="C:/projects/manifest"
                className="flex-1 h-9 px-3 text-sm bg-surface-lighter border border-surface-border rounded-md text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
              <button
                onClick={handleBrowseRepoRoot}
                className="h-9 px-3 flex items-center gap-2 text-sm text-slate-300 bg-surface-lighter border border-surface-border rounded-md hover:bg-surface-hover transition-colors"
              >
                <FolderOpen size={16} />
                Browse
              </button>
            </div>
          </div>

          {/* CLI Path (auto-computed) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              CLI Path (Auto-computed)
            </label>
            <p className="text-xs text-slate-400 mb-2">
              Path to the manifest.js CLI entry point
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={cliPathInput}
                onChange={(e) => {
                  setCliPathInput(e.target.value);
                  handleValidateCliPath(e.target.value);
                }}
                placeholder="/path/to/manifest/packages/cli/bin/manifest.js"
                className="flex-1 h-9 px-3 text-sm bg-surface-lighter border border-surface-border rounded-md text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              />
              {validating ? (
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              ) : cliPathValid === true ? (
                <CheckCircle2 size={20} className="text-emerald-400" />
              ) : cliPathValid === false ? (
                <XCircle size={20} className="text-red-400" />
              ) : null}
            </div>
            {cliPathValid === false && (
              <p className="text-xs text-red-400 mt-1">
                ⚠️ CLI path does not exist. Please check the path.
              </p>
            )}
            {cliPathValid === true && (
              <p className="text-xs text-emerald-400 mt-1">
                ✓ CLI path is valid
              </p>
            )}
          </div>

          {/* Current Settings Display */}
          <div className="bg-surface-lighter border border-surface-border rounded-md p-4 space-y-2">
            <h3 className="text-sm font-medium text-slate-200 mb-2">
              Current Settings
            </h3>
            <div className="text-xs space-y-1">
              <div className="flex gap-2">
                <span className="text-slate-500 w-24">Repo Root:</span>
                <span className="text-slate-300 font-mono">{repoRoot || '(not set)'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-500 w-24">CLI Path:</span>
                <span className="text-slate-300 font-mono break-all">{cliPath || '(not set)'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm text-slate-300 hover:text-slate-100 bg-surface-lighter border border-surface-border rounded-md hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || cliPathValid === false}
            className="h-9 px-4 text-sm text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
