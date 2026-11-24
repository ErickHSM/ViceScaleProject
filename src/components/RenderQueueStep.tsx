import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  Facebook,
  Instagram,
  Palmtree,
  Send,
  X,
  Youtube,
} from 'lucide-react';
import { RenderedOutput } from '../utils/renderEngine';
import { GeneratedVariation } from '../utils/variations';
import { TemplatePreviewCard } from './TemplatePreviewCard';

export type RenderJobStatus = 'queued' | 'rendering' | 'done';

export type SocialPlatformId = 'instagram' | 'tiktok' | 'youtube' | 'facebook';

export interface RenderJobItem {
  variation: GeneratedVariation;
  status: RenderJobStatus;
  progress?: number;
  output?: RenderedOutput;
  publishedPlatforms?: SocialPlatformId[];
}

interface RenderQueueStepProps {
  projectTitle: string;
  jobs: RenderJobItem[];
  onDownloadOne: (job: RenderJobItem, index: number) => void;
  onMarkPublished: (variationIds: string[], platforms: SocialPlatformId[]) => void;
  publishModalTarget: {
    mode: 'all' | 'single';
    variationIds: string[];
    preselectedPlatforms: SocialPlatformId[];
  } | null;
  onOpenPublishModal: (target: {
    mode: 'all' | 'single';
    variationIds: string[];
    preselectedPlatforms: SocialPlatformId[];
  }) => void;
  onClosePublishModal: () => void;
}

const TikTokGlyph: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3 15.28a6.34 6.34 0 0 0 10.82 4.48 6.26 6.26 0 0 0 1.86-4.47V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-.87-.07Z" />
  </svg>
);

const SOCIAL_PLATFORMS: {
  id: SocialPlatformId;
  label: string;
  renderIcon: (className?: string) => React.ReactNode;
}[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    renderIcon: (cls = 'w-4 h-4') => <Instagram className={cls} />,
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    renderIcon: (cls = 'w-4 h-4') => <TikTokGlyph className={cls} />,
  },
  {
    id: 'youtube',
    label: 'YouTube Shorts',
    renderIcon: (cls = 'w-4 h-4') => <Youtube className={cls} />,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    renderIcon: (cls = 'w-4 h-4') => <Facebook className={cls} />,
  },
];

export const RenderQueueStep: React.FC<RenderQueueStepProps> = ({
  projectTitle,
  jobs,
  onDownloadOne,
  onMarkPublished,
  publishModalTarget,
  onOpenPublishModal,
  onClosePublishModal,
}) => {
  const totalCount = jobs.length;
  const doneCount = jobs.filter((j) => j.status === 'done').length;
  const allDone = totalCount > 0 && doneCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatformId[]>([
    'instagram',
    'tiktok',
  ]);
  const [publishCaption, setPublishCaption] = useState('');
  const [justPublished, setJustPublished] = useState(false);

  useEffect(() => {
    if (publishModalTarget) {
      setSelectedPlatforms(publishModalTarget.preselectedPlatforms);
      setJustPublished(false);
    }
  }, [publishModalTarget]);

  const handleTogglePlatform = (id: SocialPlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleConfirmPublish = () => {
    if (!publishModalTarget || selectedPlatforms.length === 0) return;
    onMarkPublished(publishModalTarget.variationIds, selectedPlatforms);
    setJustPublished(true);
    window.setTimeout(() => {
      setJustPublished(false);
      onClosePublishModal();
    }, 1100);
  };

  return (
    <div className="space-y-5">
      {/* Progress Card (visible while rendering) */}
      {!allDone && (
        <div className="bg-white border border-slate-200/90 rounded-2xl px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-sm font-bold text-slate-900">
              Renderizando...
            </span>
            <span className="text-xs font-mono-tabular font-medium text-slate-500">
              {doneCount}/{totalCount}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              style={{ width: `${Math.max(4, progressPct)}%` }}
              className="h-full rounded-full bg-[#E6198E] transition-all duration-300"
            />
          </div>
        </div>
      )}

      {/* 5-Column Render Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {jobs.map((job, idx) => {
          const phraseText =
            job.variation.phrase.trim() || projectTitle || 'Sem frase';

          if (job.status !== 'done') {
            const isRendering = job.status === 'rendering';
            return (
              <div
                key={job.variation.id}
                className="rounded-2xl overflow-hidden border border-slate-200/90 bg-white shadow-xs flex flex-col"
              >
                <div className="relative aspect-[9/16] bg-[#0B0B0F] flex flex-col items-center justify-center p-4 text-center select-none">
                  <div
                    className={`flex flex-col items-center ${
                      isRendering ? 'animate-pulse' : ''
                    }`}
                  >
                    <Palmtree className="w-11 h-11 text-[#E6198E]" />
                    <span className="text-xs font-medium text-white/60 mt-2 font-mono-tabular">
                      {isRendering
                        ? `Montando vídeo... ${job.progress ? `${job.progress}%` : ''}`
                        : 'Aguardando na fila'}
                    </span>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-3 text-left bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                    <p className="text-xs font-bold font-mono-tabular text-white">
                      {idx + 1}/{totalCount}
                    </p>
                    <p className="text-[11px] text-white/85 truncate mt-0.5">
                      {isRendering ? 'Gerando...' : 'Na fila'} · {phraseText}
                    </p>
                  </div>
                </div>

                <div className="px-3 py-2.5 bg-white border-t border-slate-100">
                  <p className="text-[11px] font-medium text-slate-500 truncate">
                    {isRendering
                      ? `Renderizando 1080×1920 MP4${job.progress ? ` (${job.progress}%)` : '...'}`
                      : 'Na fila · qualidade primeiro'}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={job.variation.id}
              className="rounded-2xl overflow-hidden border border-slate-200/90 bg-white shadow-xs flex flex-col"
            >
              {/* Rendered Video Player 9:16 */}
              <div className="relative aspect-[9/16] bg-black overflow-hidden">
                {job.output?.videoUrl ? (
                  <video
                    src={job.output.videoUrl}
                    controls
                    playsInline
                    loop
                    poster={job.output.fallbackImageUrl}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <TemplatePreviewCard
                    project={job.variation.projectSlice}
                    previewWidthScale={0.72}
                  />
                )}
              </div>

              {/* Footer Actions: Baixar + 4 Social Publish Buttons */}
              <div className="p-2.5 space-y-2 bg-white border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onDownloadOne(job, idx)}
                  className="w-full h-9 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar</span>
                </button>

                <div className="grid grid-cols-4 gap-1.5">
                  {SOCIAL_PLATFORMS.map((plat) => {
                    const isPublished = job.publishedPlatforms?.includes(plat.id);
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        title={
                          isPublished
                            ? `Publicado no ${plat.label}`
                            : `Publicar no ${plat.label}`
                        }
                        aria-label={`Publicar variação ${idx + 1} no ${plat.label}`}
                        onClick={() => {
                          setSelectedPlatforms([plat.id]);
                          setPublishCaption(job.variation.phrase);
                          setJustPublished(false);
                          onOpenPublishModal({
                            mode: 'single',
                            variationIds: [job.variation.id],
                            preselectedPlatforms: [plat.id],
                          });
                        }}
                        className={`h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                          isPublished
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-[#E6198E]/40 hover:text-[#E6198E]'
                        }`}
                      >
                        {plat.renderIcon('w-3.5 h-3.5')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Publish Modal */}
      {publishModalTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={onClosePublishModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {publishModalTarget.mode === 'all'
                    ? `Publicar ${publishModalTarget.variationIds.length} vídeos`
                    : 'Publicar variação'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Escolha as redes sociais para enviar seu pacote renderizado.
                </p>
              </div>
              <button
                type="button"
                onClick={onClosePublishModal}
                aria-label="Fechar janela de publicação"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700">
                Plataformas de destino
              </span>
              <div className="grid grid-cols-2 gap-2">
                {SOCIAL_PLATFORMS.map((plat) => {
                  const active = selectedPlatforms.includes(plat.id);
                  return (
                    <button
                      key={plat.id}
                      type="button"
                      onClick={() => handleTogglePlatform(plat.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'border-[#E6198E] bg-pink-50/60 text-[#E6198E]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {plat.renderIcon('w-4 h-4')}
                      <span>{plat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Legenda da publicação
              </label>
              <textarea
                rows={3}
                value={publishCaption}
                onChange={(e) => setPublishCaption(e.target.value)}
                placeholder="Adicione hashtags ou chamada para ação..."
                className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#E6198E] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClosePublishModal}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={selectedPlatforms.length === 0 || justPublished}
                onClick={handleConfirmPublish}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {justPublished ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Enviado!</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Publicar agora</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
