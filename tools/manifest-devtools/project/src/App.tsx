import { useState } from 'react';
import Layout, { type ToolId } from './components/Layout';
import Dashboard from './pages/Dashboard';
import GuardDebuggerPage from './tools/guard-debugger/GuardDebuggerPage';
import FixtureGeneratorPage from './tools/fixture-generator/FixtureGeneratorPage';
import ProfilerPage from './tools/profiler/ProfilerPage';
import IRVerifierPage from './tools/ir-verifier/IRVerifierPage';
import MigrationPage from './tools/migration/MigrationPage';

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId>('dashboard');

  return (
    <Layout activeTool={activeTool} onNavigate={setActiveTool}>
      {activeTool === 'dashboard' && <Dashboard onNavigate={setActiveTool} />}
      {activeTool === 'guard-debugger' && <GuardDebuggerPage />}
      {activeTool === 'fixture-generator' && <FixtureGeneratorPage />}
      {activeTool === 'profiler' && <ProfilerPage />}
      {activeTool === 'ir-verifier' && <IRVerifierPage />}
      {activeTool === 'migration' && <MigrationPage />}
    </Layout>
  );
}
