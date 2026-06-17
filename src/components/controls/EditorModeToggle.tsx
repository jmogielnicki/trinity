import { useUIStore } from '../../store/uiStore';
import { TabBar } from '../ui/TabBar';
import { ToggleButton } from '../ui/ToggleButton';

/**
 * Global Simple / Advanced switch for the strategy editors. Simple hides the
 * less common allocation and withdrawal modes behind progressive disclosure;
 * Advanced shows all of them. Disclosure only — never changes computation.
 */
export function EditorModeToggle() {
  const editorMode = useUIStore((s) => s.editorMode);
  const setEditorMode = useUIStore((s) => s.setEditorMode);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-text-secondary">Detail</span>
      <TabBar>
        <ToggleButton
          active={editorMode === 'simple'}
          onClick={() => setEditorMode('simple')}
          title="Show only the most common strategies"
        >
          Simple
        </ToggleButton>
        <ToggleButton
          active={editorMode === 'advanced'}
          onClick={() => setEditorMode('advanced')}
          title="Show every allocation and withdrawal strategy"
        >
          Advanced
        </ToggleButton>
      </TabBar>
    </div>
  );
}
