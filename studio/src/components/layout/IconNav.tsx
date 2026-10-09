import { uiText, useUiLanguage } from '@/i18n';
import { RetroComputerLogo } from '@/components/ui/RetroComputerLogo';
import { AppIcon } from '@/components/ui/AppIcon';
import { LayoutGrid, Network, Brain, Layers, Plug, Activity, Home, Plus, Settings, HelpCircle, FolderOpen, Save, Languages } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';

export type NavSection = 'projects' | 'components' | 'models' | 'mcp' | 'library' | 'runs' | 'devices';

interface IconNavProps {
  active: NavSection | null;
  onNavigate: (section: NavSection) => void;
  saving?: boolean;
  onGoHome?: () => void;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
}

const navItems: { id: NavSection; icon: typeof LayoutGrid; label: string }[] = [
  { id: 'projects', icon: FolderOpen, label: '项目库' },
  { id: 'components', icon: LayoutGrid, label: '组件库' },
  { id: 'models', icon: Brain, label: '模型库' },
  { id: 'mcp', icon: Network, label: 'MCP 服务' },
  { id: 'library', icon: Layers, label: '场景库' },
  { id: 'runs', icon: Activity, label: '运行记录' },
  { id: 'devices', icon: Plug, label: '设备连接' },
];

const logoMenuItems = [
  { id: 'new', icon: Plus, label: '新建项目' },
  { id: 'open', icon: FolderOpen, label: '打开项目' },
  { id: 'save', icon: Save, label: '保存' },
  { id: 'divider1' },
  { id: 'home', icon: Home, label: '返回首页' },
  { id: 'divider2' },
  { id: 'settings', icon: Settings, label: '设置' },
  { id: 'help', icon: HelpCircle, label: '帮助' },
] as const;

export function IconNav({ active, onNavigate, saving, onGoHome, onNewProject, onOpenProject, onSaveProject }: IconNavProps) {
  useUiLanguage();
  const { theme, toggleTheme, language, setLanguage } = useApp();
  const english = language === 'en';
  const navLabels: Record<NavSection, string> = { projects: 'Projects', components: 'Components', models: 'Models', mcp: 'MCP Services', library: 'Scenarios', runs: 'Run History', devices: 'Devices' };
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!logoMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setLogoMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setLogoMenuOpen(false); };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [logoMenuOpen]);

  const handleLogoMenuAction = (id: string) => {
    setLogoMenuOpen(false);
    if (id === 'new') onNewProject?.();
    if (id === 'open') onOpenProject?.();
    if (id === 'save') onSaveProject?.();
    if (id === 'home') {
      onGoHome?.();
    }
  };

  return (
    <div className="w-14 h-full bg-card border-r workspace-divider flex flex-col items-center py-4 shrink-0">
      {/* Logo with dropdown */}
      <div className="mb-4 relative" ref={menuRef}>
        <button
          onClick={() => setLogoMenuOpen(!logoMenuOpen)}
          className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
          title={uiText("项目菜单")}
          aria-label={uiText("项目菜单")}
          aria-expanded={logoMenuOpen}
        >
          <RetroComputerLogo className="retro-computer-logo--nav" decorative />
        </button>

        {logoMenuOpen && (
          <div className="absolute top-0 left-[calc(100%+8px)] z-50 w-44 bg-popover border border-border rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-left-2 duration-150">
            {logoMenuItems.map((item) => {
              if (!('icon' in item)) {
                return <div key={item.id} className="h-px bg-border my-1" />;
              }
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  disabled={item.id === 'settings' || item.id === 'help' || (item.id === 'save' && saving)}
                  title={uiText(item.id === 'settings' || item.id === 'help' ? uiText("暂未开放") : undefined)}
                  onClick={() => handleLogoMenuAction(item.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 type-label text-foreground hover:bg-accent transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span>{uiText(item.id === 'save' && saving ? uiText("保存中…") : item.label)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={uiText(english ? navLabels[item.id] : item.label)}
              aria-label={uiText(english ? navLabels[item.id] : item.label)}
              aria-pressed={isActive}
              data-nav-section={item.id}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <item.icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setLanguage(english ? 'zh' : 'en')}
        title={uiText(english ? uiText("切换为中文") : 'Switch to English')}
        aria-label={uiText(english ? uiText("切换为中文") : 'Switch to English')}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Languages className="w-4 h-4" aria-hidden="true" />
      </button>

      <button
        onClick={toggleTheme}
        title={uiText(theme === 'dark' ? (english ? 'Light mode' : uiText("浅色模式")) : (english ? 'Dark mode' : uiText("深色模式")))}
        aria-label={uiText(theme === 'dark' ? (english ? 'Light mode' : uiText("浅色模式")) : (english ? 'Dark mode' : uiText("深色模式")))}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <AppIcon name={theme === 'dark' ? 'sun' : 'moon'} className="w-4 h-4" />
      </button>
    </div>
  );
}
