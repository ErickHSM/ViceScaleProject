import React, { useEffect } from 'react';
import { ArrowRight, BadgeCheck, Image as ImageIcon, Video, X } from 'lucide-react';
import { TEMPLATE_BLUEPRINTS } from '../data/initialProjects';
import { TemplateType } from '../types/template';

interface TemplatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (templateType: TemplateType) => void;
}

export const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderBlueprintWireframe = (type: TemplateType) => {
    if (type === 'twitter') {
      return (
        <div className="w-full aspect-[9/16] rounded-lg overflow-hidden border border-slate-200 bg-white flex flex-col">
          <div className="p-3 pb-2.5 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                S
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-bold text-slate-900">Seu Nome</span>
                  <BadgeCheck className="w-3 h-3 text-[#1D9BF0] fill-[#1D9BF0] stroke-white" />
                </div>
                <p className="text-[9px] text-slate-500">@seuhandle</p>
              </div>
            </div>
            <p className="text-[10px] font-semibold text-slate-900 leading-snug">
              Olha só o que rolou nesse servidor 👀
            </p>
          </div>
          <div className="flex-1 bg-[#3F3F46] flex flex-col items-center justify-center gap-1 text-zinc-200">
            <Video className="w-4 h-4" />
            <span className="text-[10px]">Video</span>
          </div>
        </div>
      );
    }

    if (type === 'meme') {
      return (
        <div className="w-full aspect-[9/16] rounded-lg overflow-hidden bg-black flex flex-col justify-between">
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-bold text-white leading-snug">
              POV: Você usou o formato de meme e VIRALIZOU com 3x mais!
            </p>
          </div>
          <div className="flex-1 bg-[#3F3F46] flex flex-col items-center justify-center gap-1 text-zinc-200">
            <Video className="w-4 h-4" />
            <span className="text-[10px]">Video</span>
          </div>
          <div className="px-3 py-2.5 flex items-center justify-center gap-2 bg-black">
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-semibold text-zinc-200">
              S
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-semibold text-white">Seu Nome</p>
              <p className="text-[9px] text-zinc-400">@seuhandle</p>
            </div>
          </div>
        </div>
      );
    }

    if (type === 'viral') {
      return (
        <div className="w-full aspect-[9/16] rounded-lg overflow-hidden bg-black flex flex-col">
          <div className="flex-1 bg-[#3F3F46] flex flex-col items-center justify-center gap-1 text-zinc-200">
            <Video className="w-4 h-4" />
            <span className="text-[10px]">Video</span>
          </div>
          <div className="px-2.5 py-2.5 bg-black text-center">
            <p className="text-[10px] font-bold text-white leading-snug">
              Isso aqui vai viralizar e você ainda não sabe por quê
            </p>
          </div>
          <div className="flex-1 bg-[#3F3F46] flex flex-col items-center justify-center gap-1 text-zinc-200">
            <ImageIcon className="w-4 h-4" />
            <span className="text-[10px]">Imagem</span>
          </div>
        </div>
      );
    }

    // raw
    return (
      <div className="w-full aspect-[9/16] rounded-lg overflow-hidden bg-[#27272A] flex flex-col items-center justify-center gap-1.5 text-zinc-200">
        <Video className="w-4 h-4" />
        <span className="text-[10px]">Video</span>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[3px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-choose-template-title"
    >
      <div
        className="w-full max-w-[960px] bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2
              id="modal-choose-template-title"
              className="font-display text-lg font-bold text-slate-900"
            >
              Escolha um template
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecione o layout ideal para subir seu vídeo e testar variações.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Blueprint Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TEMPLATE_BLUEPRINTS.map((blueprint) => (
            <div
              key={blueprint.type}
              className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col justify-between hover:border-[#E6198E]/50 transition-colors"
            >
              <div>
                {renderBlueprintWireframe(blueprint.type)}
                <div className="mt-3 text-center px-1">
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    {blueprint.label}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 min-h-[30px]">
                    {blueprint.description}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSelectTemplate(blueprint.type)}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <span>Usar este template</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
