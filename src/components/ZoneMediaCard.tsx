import React, { useRef, useState } from 'react';
import { LayoutGrid, List, Trash2, Upload } from 'lucide-react';
import { ZoneMediaItem } from '../types/template';

interface ZoneMediaCardProps {
  zoneNumber: number;
  title: string;
  kind: 'video' | 'image';
  items: ZoneMediaItem[];
  selectedId?: string;
  onAddFiles: (files: FileList) => void;
  onSelectItem: (itemId: string) => void;
  onUpdateItem: (itemId: string, patch: Partial<ZoneMediaItem>) => void;
  onRemoveItem: (itemId: string) => void;
}

export const ZoneMediaCard: React.FC<ZoneMediaCardProps> = ({
  zoneNumber,
  title,
  kind,
  items,
  selectedId,
  onAddFiles,
  onSelectItem,
  onUpdateItem,
  onRemoveItem,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trimBarRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  const startTrimDrag = (handle: 'start' | 'end', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedItem || !trimBarRef.current) return;

    const barRect = trimBarRef.current.getBoundingClientRect();
    const totalDur = Math.max(0.5, selectedItem.durationSec || 1);
    const minGap = Math.min(0.5, totalDur * 0.1);

    const onMove = (moveEvt: PointerEvent) => {
      const ratio = Math.min(1, Math.max(0, (moveEvt.clientX - barRect.left) / barRect.width));
      const sec = Number((ratio * totalDur).toFixed(1));
      if (handle === 'start') {
        const clamped = Math.min(sec, selectedItem.trimEnd - minGap);
        onUpdateItem(selectedItem.id, { trimStart: Math.max(0, clamped) });
      } else {
        const clamped = Math.max(sec, selectedItem.trimStart + minGap);
        onUpdateItem(selectedItem.id, { trimEnd: Math.min(totalDur, clamped) });
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const duration = Math.max(0.5, selectedItem?.durationSec ?? 0);
  const trimStart = selectedItem?.trimStart ?? 0;
  const trimEnd = selectedItem ? Math.max(trimStart, selectedItem.trimEnd || duration) : 0;
  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const clipDuration = Math.max(0, trimEnd - trimStart);

  const renderFramingSlider = (
    label: string,
    displayValue: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (val: number) => void
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-mono-tabular text-slate-500">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-slider-hollow w-full"
      />
    </div>
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`bg-white border rounded-2xl p-5 space-y-4 transition-colors ${
        isDragging ? 'border-[#E6198E] bg-pink-50/20' : 'border-slate-200/90'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={kind === 'video' ? 'video/*' : 'image/*'}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddFiles(e.target.files);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-[#E6198E] text-white text-xs font-mono-tabular font-bold flex items-center justify-center shrink-0">
              {zoneNumber}
            </span>
            <h2 className="font-display text-sm font-bold text-slate-900">{title}</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Suba quantos arquivos quiser. Cada um vira uma opção diferente pra combinar no passo de Variações.
          </p>
        </div>

        {/* Grid / List View Switch */}
        <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/80 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            aria-label="Visualização em grade"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            aria-label="Visualização em lista"
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Empty State vs Populated List/Grid */}
      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-32 h-32 rounded-xl border border-slate-200 hover:border-[#E6198E]/60 bg-slate-50/40 hover:bg-pink-50/20 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer p-3"
        >
          <div className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500">
            <Upload className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium text-slate-600 text-center leading-tight">
            {kind === 'video' ? 'Adicionar vídeo(s)' : 'Adicionar imagem(ns)'}
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          {/* Top Full-Width Upload More Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:border-[#E6198E]/50 hover:bg-pink-50/20 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>{kind === 'video' ? 'Enviar mais vídeos' : 'Enviar mais imagens'}</span>
          </button>

          {/* Items List or Grid */}
          {viewMode === 'list' ? (
            <div className="max-h-[268px] overflow-y-auto space-y-2 pr-1">
              {items.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item.id)}
                    className={`rounded-xl border p-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-[#E6198E] bg-white ring-1 ring-[#E6198E]/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                        {item.kind === 'video' ? (
                          <video
                            src={item.url}
                            muted
                            preload="metadata"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={item.url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {item.kind === 'video' ? 'Vídeo' : 'Imagem'}
                          {isSelected ? ' · selecionado' : ''}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono-tabular truncate mt-0.5">
                          {item.kind === 'video'
                            ? `${item.durationSec.toFixed(1)}s no arquivo`
                            : item.name}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveItem(item.id);
                      }}
                      title="Remover arquivo"
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[268px] overflow-y-auto pr-1">
              {items.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectItem(item.id)}
                    className={`group relative rounded-xl border overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#E6198E] ring-2 ring-[#E6198E]/25'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="aspect-square bg-zinc-900">
                      {item.kind === 'video' ? (
                        <video
                          src={item.url}
                          muted
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="p-1.5 bg-white flex items-center justify-between gap-1">
                      <span className="text-[10px] font-mono-tabular text-slate-600 truncate">
                        {item.kind === 'video' ? `${item.durationSec.toFixed(1)}s` : item.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveItem(item.id);
                        }}
                        className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        aria-label="Remover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Trim & Framing Panel ("Ajustar corte") */}
          {selectedItem && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-3.5 bg-white">
              {selectedItem.kind === 'video' && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Ajustar corte</span>
                    <span className="font-mono-tabular text-slate-500">
                      {trimStart.toFixed(1)}s – {trimEnd.toFixed(1)}s ({clipDuration.toFixed(1)}s)
                    </span>
                  </div>

                  {/* Interactive Magenta Trim Bar with Black Handles */}
                  <div
                    ref={trimBarRef}
                    className="relative h-8 rounded-lg bg-slate-100 overflow-hidden select-none"
                  >
                    <div
                      style={{
                        left: `${startPct}%`,
                        width: `${Math.max(2, endPct - startPct)}%`,
                      }}
                      className="absolute top-0 bottom-0 bg-[#E6198E] flex items-center justify-between"
                    >
                      <button
                        type="button"
                        aria-label="Ajustar início do corte"
                        onPointerDown={(e) => startTrimDrag('start', e)}
                        className="w-2 h-full bg-slate-900 hover:bg-black cursor-ew-resize shrink-0"
                      />
                      <button
                        type="button"
                        aria-label="Ajustar fim do corte"
                        onPointerDown={(e) => startTrimDrag('end', e)}
                        className="w-2 h-full bg-slate-900 hover:bg-black cursor-ew-resize shrink-0"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 3 Framing Sliders: Zoom, Horizontal, Vertical */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {renderFramingSlider(
                  'Zoom',
                  `${selectedItem.zoom.toFixed(2)}x`,
                  selectedItem.zoom,
                  1,
                  2.5,
                  0.05,
                  (val) => onUpdateItem(selectedItem.id, { zoom: val })
                )}
                {renderFramingSlider(
                  'Horizontal',
                  `${selectedItem.panX}%`,
                  selectedItem.panX,
                  0,
                  100,
                  1,
                  (val) => onUpdateItem(selectedItem.id, { panX: val })
                )}
                {renderFramingSlider(
                  'Vertical',
                  `${selectedItem.panY}%`,
                  selectedItem.panY,
                  0,
                  100,
                  1,
                  (val) => onUpdateItem(selectedItem.id, { panY: val })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
