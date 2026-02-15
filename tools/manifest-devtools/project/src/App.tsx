import { useState, useEffect } from 'react';
import Layout, { type ToolId } from './components/Layout';
import Dashboard from './pages/Dashboard';
import GuardDebuggerPage from './tools/guard-debugger/GuardDebuggerPage';
import FixtureGeneratorPage from './tools/fixture-generator/FixtureGeneratorPage';
import ProfilerPage from './tools/profiler/ProfilerPage';
import IRVerifierPage from './tools/ir-verifier/IRVerifierPage';
import MigrationPage from './tools/migration/MigrationPage';
import EntityScannerPage from './tools/entity-scanner/EntityScannerPage';
import PolicyCoveragePage from './tools/policy-coverage/PolicyCoveragePage';
import IssueTrackerPage from './tools/issue-tracker/IssueTrackerPage';
import { loadSavedRoot, setManifestRoot, saveRoot, pickDirectory } from './lib/api';

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId>('dashboard');
  const [manifestRoot, setRoot] = useState('');
  const [rootInput, setRootInput] = useState('');

  useEffect(() => {
    loadSavedRoot().then(saved => {
      if (saved) {
        setRoot(saved);
        setRootInput(saved);
        setManifestRoot(saved);
      }
    }).catch(() => {});
  }, []);

  const handleSetRoot = async (newRoot: string) => {
    setRoot(newRoot);
    setRootInput(newRoot);
    setManifestRoot(newRoot);
    await saveRoot(newRoot).catch(() => {});
  };

  const handleBrowse = async () => {
    const dir = await pickDirectory().catch(() => null);
    if (dir) {
      handleSetRoot(dir);
    }
  };

  const handleRootSubmit = () => {
    if (rootInput.trim()) {
      handleSetRoot(rootInput.trim());
    }
  };

  return (
    <Layout
      activeTool={activeTool}
      onNavigate={setActiveTool}
      manifestRoot={manifestRoot}
      rootInput={rootInput}
      onRootInputChange={setRootInput}
      onRootSubmit={handleRootSubmit}
      onBrowse={handleBrowse}
    >
      {activeTool === 'dashboard' && <Dashboard onNavigate={setActiveTool} />}
      {activeTool === 'entity-scanner' && <EntityScannerPage />}
      {activeTool === 'policy-coverage' && <PolicyCoveragePage />}
      {activeTool === 'issue-tracker' && <IssueTrackerPage />}
      {activeTool === 'guard-debugger' && <GuardDebuggerPage />}
      {activeTool === 'fixture-generator' && <FixtureGeneratorPage />}
      {activeTool === 'profiler' && <ProfilerPage />}
      {activeTool === 'ir-verifier' && <IRVerifierPage />}
      {activeTool === 'migration' && <MigrationPage />}
    </Layout>
  );
}
