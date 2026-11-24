import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ProjectStatus, TemplateProject, TemplateType } from '../types/template';
import { TemplatePreviewCard } from './TemplatePreviewCard';

interface ProjectsGridProps {
  projects: TemplateProject[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenNewModal: () => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

const TEMPLATE_LABEL_MAP: Record<TemplateType, string> = {
  twitter: 'Twitter / X',
  meme: 'Meme',
  viral: 'Video Viral',
  raw: 'Sem template',
};

export const ProjectsGrid: React.FC<ProjectsGridProps> = ({
  projects,
  searchQuery,
  onSearchChange,
  onOpenProject,
  onOpenNewModal,
  onDuplicateProject,
  onDeleteProject,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TemplateType>('all');

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.templateType !== typeFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.profile.name.toLowerCase().includes(q) ||
        p.profile.handle.toLowerCase().includes(q) ||
        p.phrases.mainPhrase.toLowerCase().includes(q)
      );
    });
  }, [projects, searchQuery, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    return {
      all: projects.length,
      pronto: projects.filter((p) => p.status === 'pronto').length,
      rascunho: projects.filter((p) => p.status === 'rascunho').length,
      falhou: projects.filter((p) => p.status === 'falhou').length,
    };
  }, [projects]);

  const renderStatusTag = (status: ProjectStatus) => {
    if (status === 'pronto') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E6198E] text-white text-[11px] font-semibold shadow-xs">
          <Check className="w-3 h-3 stroke-[2.5]" />
          Pronto
        </span>
      );
    }
    if (status === 'rascunho') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/95 text-slate-800 text-[11px] font-semibold border border-slate-200 shadow-xs">
          <Pencil className="w-3 h-3 text-amber-600" />
          Rascunho
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/95 text-rose-700 text-[11px] font-semibold border border-rose-200 shadow-xs">
        <AlertCircle className="w-3 h-3 text-rose-600" />
        Falhou
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar projetos, clipes, templates..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenNewModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-sm font-semibold shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo template</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto space-y-6">
        {/* Page Header + Filter Strip */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E6198E] text-white flex items-center justify-center shrink-0">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 leading-tight">
                Meus Templates & Projetos
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Projetos salvos prontos para testar novos vídeos ou exportar variações ·{' '}
                <span className="font-mono-tabular font-medium text-slate-700">
                  {filteredProjects.length}
                </span>{' '}
                {filteredProjects.length === 1 ? 'projeto' : 'projetos'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Segmented Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: `Todos (${counts.all})` },
                  { id: 'pronto', label: `Prontos (${counts.pronto})` },
                  { id: 'rascunho', label: `Rascunhos (${counts.rascunho})` },
                  { id: 'falhou', label: `Falhou (${counts.falhou})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono-tabular ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Template Type Select */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | TemplateType)}
              aria-label="Filtrar por formato de template"
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#E6198E] cursor-pointer"
            >
              <option value="all">Todos os formatos</option>
              <option value="twitter">Twitter / X</option>
              <option value="meme">Meme</option>
              <option value="viral">Video Viral</option>
              <option value="raw">Upload sem template</option>
            </select>
          </div>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6198E] flex items-center justify-center mx-auto mb-3">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <h2 className="font-display text-base font-bold text-slate-900">
              {projects.length === 0 ? 'Nenhum projeto salvo ainda' : 'Nenhum projeto encontrado'}
            </h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              {projects.length === 0
                ? 'Clique em Novo template para subir seu vídeo, configurar o estilo e gerar variações em MP4.'
                : 'Tente limpar os filtros atuais ou crie um novo template para testar seu vídeo.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Limpar filtros
                </button>
              )}
              <button
                type="button"
                onClick={onOpenNewModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#E6198E] hover:bg-[#CC147D] rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Novo template
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProjects.map((project) => (
              <article
                key={project.id}
                className="group bg-white border border-slate-200/90 rounded-2xl p-2.5 hover:border-[#E6198E]/40 hover:shadow-md transition-all flex flex-col"
              >
                {/* 9:16 Thumbnail */}
                <div
                  onClick={() => onOpenProject(project.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenProject(project.id);
                    }
                  }}
                  className="relative rounded-xl overflow-hidden cursor-pointer border border-slate-100 bg-zinc-900"
                >
                  <TemplatePreviewCard project={project} compact />

                  {/* Top-left Status Indicator */}
                  <div className="absolute top-2.5 left-2.5 z-10">
                    {renderStatusTag(project.status)}
                  </div>

                  {/* Quick Hover Actions */}
                  <div
                    className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="Duplicar projeto"
                      onClick={() => onDuplicateProject(project.id)}
                      className="w-7 h-7 rounded-md bg-white/95 hover:bg-white text-slate-700 flex items-center justify-center shadow-xs border border-slate-200 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Excluir projeto"
                      onClick={() => onDeleteProject(project.id)}
                      className="w-7 h-7 rounded-md bg-white/95 hover:bg-rose-50 text-rose-600 flex items-center justify-center shadow-xs border border-slate-200 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-2.5 px-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3
                      onClick={() => onOpenProject(project.id)}
                      className="text-sm font-bold text-slate-900 truncate cursor-pointer hover:text-[#E6198E] transition-colors"
                    >
                      {project.title}
                    </h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      <span>{project.updatedAtLabel}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{TEMPLATE_LABEL_MAP[project.templateType]}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label={`Abrir ${project.title}`}
                    onClick={() => onOpenProject(project.id)}
                    className="w-8 h-8 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
