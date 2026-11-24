/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Flame, LayoutGrid, Plus, Sparkles, Trash2 } from 'lucide-react';
import { ProjectsGrid } from './components/ProjectsGrid';
import { Sidebar } from './components/Sidebar';
import { TemplatePickerModal } from './components/TemplatePickerModal';
import { TemplateStudio } from './components/TemplateStudio';
import { ViceScrapView } from './components/ViceScrapView';
import {
  createProjectFromTemplate,
  INITIAL_PROJECTS,
  INITIAL_SAVED_PROFILES,
  INITIAL_SAVED_STYLES,
  VIRAL_HOOK_PRESETS,
} from './data/initialProjects';
import {
  SavedProfile,
  SavedStyle,
  ScrapedVideoItem,
  SidebarSection,
  TemplateProject,
  TemplateType,
  ZoneMediaItem,
} from './types/template';

const STORAGE_PROJECTS_KEY = 'scaleclip_projects_v1';
const STORAGE_SEED_CLEANED_KEY = 'scaleclip_seed_cleaned_v1';
const STORAGE_PROFILES_KEY = 'scaleclip_profiles_v1';
const STORAGE_STYLES_KEY = 'scaleclip_styles_v1';
const LEGACY_SEEDED_IDS = new Set(['proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5', 'proj-6']);

export default function App() {
  const [projects, setProjects] = useState<TemplateProject[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PROJECTS_KEY);
      const alreadyCleaned = localStorage.getItem(STORAGE_SEED_CLEANED_KEY) === '1';
      if (raw) {
        const parsed = JSON.parse(raw) as TemplateProject[];
        if (Array.isArray(parsed)) {
          const filtered = alreadyCleaned
            ? parsed
            : parsed.filter((p) => !LEGACY_SEEDED_IDS.has(p.id));
          if (!alreadyCleaned) {
            localStorage.setItem(STORAGE_SEED_CLEANED_KEY, '1');
          }
          return filtered.map((p) => ({
            ...p,
            zones: {
              presetId: p.zones?.presetId ?? 'single_video',
              blurBackground: p.zones?.blurBackground ?? false,
              items:
                Array.isArray(p.zones?.items) && p.zones.items.length > 0
                  ? p.zones.items
                  : [{ id: `z-${p.id}-1`, kind: 'video', weight: 1.0 }],
              videoHeightPercent: p.zones?.videoHeightPercent ?? 64,
              videoFit: p.zones?.videoFit ?? 'cover',
              videoBorderRadius: p.zones?.videoBorderRadius ?? 0,
              splitRatio: p.zones?.splitRatio ?? 50,
              showTopBar: p.zones?.showTopBar ?? true,
              showBottomBar: p.zones?.showBottomBar ?? false,
            },
            media: {
              ...p.media,
              zoneAssets: p.media?.zoneAssets ?? {},
              zoneMediaItems: p.media?.zoneMediaItems ?? {},
              selectedZoneMediaId: p.media?.selectedZoneMediaId ?? {},
            },
            style: {
              fontFamily: p.style?.fontFamily ?? 'Plus Jakarta Sans',
              fontWeight: p.style?.fontWeight ?? '600',
              phraseColor: p.style?.phraseColor ?? null,
              strokeEnabled: p.style?.strokeEnabled ?? false,
              strokeColor: p.style?.strokeColor ?? '#000000',
              strokeWidth: p.style?.strokeWidth ?? 4,
              customBgColor: p.style?.customBgColor ?? '#FFFFFF',
              customTextColor: p.style?.customTextColor ?? '#111827',
              useCustomColors: p.style?.useCustomColors ?? false,
            },
            variationsConfig: {
              combineMode: p.variationsConfig?.combineMode ?? 'cross',
              stripMetadata: p.variationsConfig?.stripMetadata ?? true,
              antiDuplicate: p.variationsConfig?.antiDuplicate ?? true,
            },
          }));
        }
      }
      if (!alreadyCleaned) {
        localStorage.setItem(STORAGE_SEED_CLEANED_KEY, '1');
      }
    } catch {
      // Fallback to empty projects list
    }
    return INITIAL_PROJECTS;
  });

  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PROFILES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedProfile[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to starter profiles
    }
    return INITIAL_SAVED_PROFILES;
  });

  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_STYLES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedStyle[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to starter styles
    }
    return INITIAL_SAVED_STYLES;
  });

  const [activeSection, setActiveSection] = useState<SidebarSection>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [scrapHistory, setScrapHistory] = useState<ScrapedVideoItem[]>([]);

  // Persist projects cleanly (strip transient blob: video URLs across browser reloads)
  useEffect(() => {
    try {
      const serializable = projects.map((p) => {
        const cleanZoneAssets = Object.fromEntries(
          Object.entries(p.media.zoneAssets ?? {}).filter(
            ([, asset]) => !asset.url.startsWith('blob:')
          )
        );
        const cleanZoneMediaItems = Object.fromEntries(
          Object.entries(p.media.zoneMediaItems ?? {}).map(([slot, list]) => [
            slot,
            list.filter((item) => !item.url.startsWith('blob:')),
          ])
        );
        return {
          ...p,
          media: {
            ...p.media,
            videoUrl: p.media.videoUrl?.startsWith('blob:') ? null : p.media.videoUrl,
            zoneAssets: cleanZoneAssets,
            zoneMediaItems: cleanZoneMediaItems,
          },
        };
      });
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(serializable));
    } catch {
      // Ignore storage quota errors
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(savedProfiles));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedProfiles]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STYLES_KEY, JSON.stringify(savedStyles));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedStyles]);

  const activeProject = projects.find((p) => p.id === editingProjectId) ?? null;

  const handleSelectTemplateFromModal = (templateType: TemplateType) => {
    const newProj = createProjectFromTemplate(templateType);
    setProjects((prev) => [newProj, ...prev]);
    setIsNewModalOpen(false);
    setActiveSection('templates');
    setEditingProjectId(newProj.id);
  };

  const handleUpdateProject = (updated: TemplateProject) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleSaveProjectAndExit = (updated: TemplateProject) => {
    handleUpdateProject(updated);
    setEditingProjectId(null);
    setActiveSection('templates');
  };

  const handleDuplicateProject = (projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const copy: TemplateProject = {
      ...target,
      id: `proj-${Date.now()}`,
      title: `${target.title} (Cópia)`,
      status: 'rascunho',
      updatedAtLabel: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    };
    setProjects((prev) => [copy, ...prev]);
  };

  const handleDeleteProject = (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (editingProjectId === projectId) {
      setEditingProjectId(null);
    }
  };

  const handleSaveProfilePreset = (profileData: Omit<SavedProfile, 'id'>) => {
    const newPreset: SavedProfile = {
      ...profileData,
      id: `prof-${Date.now()}`,
    };
    setSavedProfiles((prev) => [newPreset, ...prev]);
  };

  const handleSaveStylePreset = (styleData: Omit<SavedStyle, 'id'>) => {
    const newPreset: SavedStyle = {
      ...styleData,
      id: `style-${Date.now()}`,
    };
    setSavedStyles((prev) => [newPreset, ...prev]);
  };

  const handleCreateWithHook = (hookText: string) => {
    const newProj = createProjectFromTemplate('twitter');
    newProj.phrases.mainPhrase = hookText;
    newProj.phrases.variations = [hookText];
    setProjects((prev) => [newProj, ...prev]);
    setActiveSection('templates');
    setEditingProjectId(newProj.id);
  };

  const handleUseScrapedVideoInTemplate = (payload: {
    cacheUrl: string;
    name: string;
    durationSec: number;
    caption: string;
    coverThumbUrl: string | null;
    templateType: TemplateType;
  }) => {
    const newProj = createProjectFromTemplate(payload.templateType);
    const firstVideoZone = newProj.zones.items.find((z) => z.kind === 'video');
    const slotKey = firstVideoZone ? firstVideoZone.id : 'zone-0';
    const mediaItemId = `scrap-${Date.now()}`;
    const mediaItem: ZoneMediaItem = {
      id: mediaItemId,
      url: payload.cacheUrl,
      name: payload.name,
      kind: 'video',
      durationSec: Math.max(2, payload.durationSec || 5),
      trimStart: 0,
      trimEnd: Math.max(2, payload.durationSec || 5),
      zoom: 1,
      panX: 50,
      panY: 50,
    };

    const cleanCaption = payload.caption.trim().slice(0, 180);
    if (cleanCaption && payload.templateType !== 'raw') {
      newProj.phrases.mainPhrase = cleanCaption;
      newProj.phrases.variations = [cleanCaption];
    }

    newProj.media.videoUrl = payload.cacheUrl;
    newProj.media.videoName = payload.name;
    newProj.media.zoneAssets = {
      [slotKey]: { url: payload.cacheUrl, name: payload.name, kind: 'video' },
    };
    newProj.media.zoneMediaItems = {
      [slotKey]: [mediaItem],
    };
    newProj.media.selectedZoneMediaId = {
      [slotKey]: mediaItemId,
    };
    if (payload.coverThumbUrl) {
      newProj.coverImageUrl = payload.coverThumbUrl;
    }

    setProjects((prev) => [newProj, ...prev]);
    setActiveSection('templates');
    setEditingProjectId(newProj.id);
  };

  return (
    <div className="min-h-screen flex bg-[#F8F9FB] text-slate-900">
      {/* Left Navigation Sidebar */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setActiveSection(sec);
          setEditingProjectId(null);
        }}
        onOpenNewTemplateModal={() => setIsNewModalOpen(true)}
      />

      {/* Screen 3: Studio Editor View */}
      {activeProject ? (
        <TemplateStudio
          project={activeProject}
          savedProfiles={savedProfiles}
          savedStyles={savedStyles}
          onChangeProject={handleUpdateProject}
          onSaveProjectAndExit={handleSaveProjectAndExit}
          onSaveProfilePreset={handleSaveProfilePreset}
          onSaveStylePreset={handleSaveStylePreset}
          onBack={() => setEditingProjectId(null)}
        />
      ) : activeSection === 'templates' ? (
        /* Screen 1: Projects & Templates Grid */
        <ProjectsGrid
          projects={projects}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenProject={(id) => setEditingProjectId(id)}
          onOpenNewModal={() => setIsNewModalOpen(true)}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
        />
      ) : activeSection === 'vicescrap' ? (
        /* ViceScrap Video & Profile Extractor */
        <ViceScrapView
          historyItems={scrapHistory}
          onAddHistoryItem={(item) =>
            setScrapHistory((prev) => [item, ...prev.filter((x) => x.id !== item.id)].slice(0, 24))
          }
          onRemoveHistoryItem={(id) =>
            setScrapHistory((prev) => prev.filter((item) => item.id !== id))
          }
          onClearHistory={() => setScrapHistory([])}
          onUseVideoInTemplate={handleUseScrapedVideoInTemplate}
        />
      ) : activeSection === 'home' ? (
        /* Home Overview View */
        <div className="flex-1 p-8 max-w-[1200px] mx-auto space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Bem-vindo ao ScaleClip
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Escolha um template pronto, suba seu vídeo e teste variações para TikTok, Reels e Shorts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsNewModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-sm font-semibold shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo template
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Total de projetos</p>
              <p className="font-display text-3xl font-bold text-slate-900 mt-1 font-mono-tabular">
                {projects.length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Templates prontos</p>
              <p className="font-display text-3xl font-bold text-emerald-600 mt-1 font-mono-tabular">
                {projects.filter((p) => p.status === 'pronto').length}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Perfis salvos</p>
              <p className="font-display text-3xl font-bold text-[#E6198E] mt-1 font-mono-tabular">
                {savedProfiles.length}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pink-50 text-[#E6198E] flex items-center justify-center">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Acessar todos os projetos
                </h2>
                <p className="text-xs text-slate-500">
                  Abra qualquer projeto salvo para editar o perfil ou testar um novo vídeo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('templates')}
              className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
            >
              Ver galeria
            </button>
          </div>
        </div>
      ) : activeSection === 'pack' ? (
        /* Pack Viral Hooks Library */
        <div className="flex-1 p-8 max-w-[1200px] mx-auto space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#E6198E] text-white flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold text-slate-900">
                  Pack Viral — Ganchos de Retenção
                </h1>
                <p className="text-xs text-slate-500">
                  Clique em qualquer gancho abaixo para abrir diretamente no Estúdio de Templates.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {VIRAL_HOOK_PRESETS.map((hook, idx) => (
              <div
                key={hook}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-[11px] font-mono-tabular font-semibold text-[#E6198E]">
                    Gancho #{idx + 1}
                  </span>
                  <p className="text-sm font-medium text-slate-900">{hook}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCreateWithHook(hook)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-xs font-semibold shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Usar gancho
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Settings & Saved Profiles */
        <div className="flex-1 p-8 max-w-[900px] mx-auto space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900">
                Configurações & Perfis Salvos
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Gerencie os perfis reutilizáveis para aplicar rapidamente em novos templates.
              </p>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {savedProfiles.map((prof) => (
                <div
                  key={prof.id}
                  className="p-3.5 bg-white flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{prof.name}</p>
                    <p className="text-xs text-slate-500">
                      @{prof.handle} · Tema {prof.theme === 'light' ? 'Claro' : 'Escuro'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSavedProfiles((prev) => prev.filter((item) => item.id !== prof.id))
                    }
                    className="p-2 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                    aria-label="Excluir perfil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Screen 2: Template Picker Modal */}
      <TemplatePickerModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSelectTemplate={handleSelectTemplateFromModal}
      />
    </div>
  );
}
