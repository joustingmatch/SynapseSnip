import { AnnotationCanvas } from "../components/AnnotationCanvas";
import { GridBackground } from "../components/GridBackground";
import { SettingsPanel } from "../components/SettingsPanel";
import { TitleBar } from "../components/TitleBar";
import { Toolbar } from "../components/Toolbar";
import { EditorActionDock } from "../components/editor/EditorActionDock";
import { useEditorController } from "../hooks/useEditorController";

export function EditorPage() {
  const {
    capture,
    showSettings,
    setShowSettings,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onCrop,
    onSaveAs,
    onClose,
  } = useEditorController();

  if (!capture) {
    return (
      <div 
        className="w-screen h-screen flex flex-col"
        style={{ 
          background: 'var(--bg-primary)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)'
        }}
      >
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
          <div 
            className="px-4 py-2 rounded text-sm font-medium animate-fade-in"
            style={{ 
              background: 'var(--surface-default)',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="relative w-screen h-screen overflow-hidden flex flex-col"
      style={{ 
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)'
      }}
    >
      <GridBackground />

      <TitleBar
        subtitle={`${capture.width} × ${capture.height}`}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main Canvas Area */}
      <main 
        className="flex-1 relative overflow-hidden"
        style={{ marginTop: '1px' }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div 
            className="relative animate-scale-in"
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden'
            }}
          >
            <AnnotationCanvas capture={capture} onCrop={onCrop} />
          </div>
        </div>
      </main>

      {/* Floating Toolbar */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10">
        <Toolbar />
      </div>

      {/* Bottom Action Dock */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <EditorActionDock
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onOpenSettings={() => setShowSettings(true)}
          onDiscard={onClose}
          onSave={onSaveAs}
        />
      </div>

      {showSettings && <SettingsPanel />}
    </div>
  );
}
