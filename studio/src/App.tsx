import { WorkspacePanelLayer } from '@/components/layout/NavigationPanel';
import { useRef, useState } from 'react';
import { recoveredProjects } from '@/domain/projectAutosave';
import { IconNav, type NavSection } from '@/components/layout/IconNav';
import { HomePage } from '@/components/pages/HomePage';
import { WorkspacePage, type WorkflowProject, type WorkspaceMode, type WorkspacePageRef } from '@/components/pages/WorkspacePage';

function App() {
  const workspaceRef = useRef<WorkspacePageRef>(null);
  const [hasRecovery] = useState(() => recoveredProjects().length > 0);
  const [phase, setPhase] = useState<'home' | 'workspace'>(hasRecovery ? 'workspace' : 'home');
  const [started, setStarted] = useState(hasRecovery);
  const [initialProject, setInitialProject] = useState<WorkflowProject>();
  const [activePanel, setActivePanel] = useState<NavSection | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('edit');
  const [saving, setSaving] = useState(false);

  const handleOpenProject = (project?: WorkflowProject) => {
    if (started) {
      if (project) workspaceRef.current?.openProject(project);
      else workspaceRef.current?.newProject();
    } else {
      setInitialProject(project);
      setStarted(true);
    }
    setPhase('workspace');
    setActivePanel(null);
    setWorkspaceMode('edit');
  };
  const changeMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    setActivePanel(null);
  };
  const togglePanel = (section: NavSection) => {
    setActivePanel(current => current === section ? null : section);
  };
  const closePanel = (section: NavSection) => setActivePanel(current => current === section ? null : current);

  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      {phase === 'home' && <HomePage projectActionsDisabled={saving} onProjectDeleted={id => workspaceRef.current?.projectDeleted(id)} onOpenProject={handleOpenProject} onResume={started ? () => setPhase('workspace') : undefined} />}
      {started && <div className={phase === 'workspace' ? 'flex h-full w-full min-w-0' : 'hidden'} aria-hidden={phase !== 'workspace'}>
        <IconNav
          active={activePanel}
          onNavigate={togglePanel}
          saving={saving}
          onNewProject={() => workspaceRef.current?.newProject()}
          onOpenProject={() => setActivePanel('projects')}
          onSaveProject={() => { void workspaceRef.current?.saveProject(); }}
          onGoHome={() => workspaceRef.current?.goHome()}
        />
        <WorkspacePanelLayer>
          <WorkspacePage
            ref={workspaceRef}
            projectName={initialProject?.name || 'Untitled Workflow'}
            initialProject={initialProject}
            visible={phase === 'workspace'}
            onSavingChange={setSaving}
            projectActionsDisabled={saving}
            workspaceMode={workspaceMode}
            onWorkspaceModeChange={changeMode}
            onGoHome={() => { setPhase('home'); setActivePanel(null); }}
            projectLibraryOpen={activePanel === 'projects'}
            onProjectLibraryClose={() => closePanel('projects')}
            onProjectLibraryToggle={() => togglePanel('projects')}
            mcpLibraryOpen={activePanel === 'mcp'}
            onMcpLibraryClose={() => closePanel('mcp')}
            modelLibraryOpen={activePanel === 'models'}
            onModelLibraryClose={() => closePanel('models')}
            sidebarOpen={activePanel === 'components'}
            onSidebarClose={() => closePanel('components')}
            sceneLibraryOpen={activePanel === 'library'}
            onSceneLibraryClose={() => closePanel('library')}
            diagnosticPanel={activePanel === 'runs' || activePanel === 'devices' ? activePanel : undefined}
            onDiagnosticClose={() => setActivePanel(null)}
          />
        </WorkspacePanelLayer>
      </div>}
    </div>
  );
}

export default App;
