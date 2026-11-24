import React from 'react';
import {
  Download,
  Flame,
  FolderKanban,
  Home,
  LayoutGrid,
  MessageSquare,
  Palmtree,
  Settings,
} from 'lucide-react';
import { SidebarSection } from '../types/template';

interface SidebarProps {
  activeSection: SidebarSection;
  onSelectSection: (section: SidebarSection) => void;
  onOpenNewTemplateModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  onOpenNewTemplateModal,
}) => {
  const navItems: { id: SidebarSection; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'templates', label: 'Templates', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'vicescrap', label: 'ViceScrap', icon: <Download className="w-4 h-4" /> },
    { id: 'pack', label: 'Pack Viral', icon: <Flame className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-[236px] shrink-0 bg-white border-r border-slate-200/80 flex flex-col justify-between min-h-screen select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#E6198E] flex items-center justify-center text-white shadow-xs">
            <Palmtree className="w-4 h-4" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900">
            ScaleClip
          </span>
        </div>

        {/* Navigation Section */}
        <div className="px-3 pt-4">
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400">
            Geral
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={isActive ? 'text-[#E6198E]' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={onOpenNewTemplateModal}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span className="text-slate-400">
                <FolderKanban className="w-4 h-4" />
              </span>
              <span>Novo Projeto</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Bottom Community Promo & Settings */}
      <div className="p-3 space-y-2">
        <div className="rounded-xl bg-gradient-to-br from-pink-50 via-rose-50/70 to-white border border-pink-100 p-3.5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#E6198E] text-white flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <p className="text-xs font-bold text-slate-900">Comunidade</p>
              <p className="text-xs font-bold text-slate-900">ScaleClip</p>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600 mb-3">
            Troque ideias, hooks e formatos com outros criadores de vídeos curtos.
          </p>
          <button
            type="button"
            onClick={() => onSelectSection('pack')}
            className="w-full py-2 px-3 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Ver ganchos virais
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectSection('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeSection === 'settings'
              ? 'bg-slate-100 text-slate-900 font-semibold'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Configurações</span>
        </button>
      </div>
    </aside>
  );
};
