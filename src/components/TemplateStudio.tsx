import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  Columns2,
  Download,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Link2,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Share2,
  ShieldCheck,
  Square,
  Sun,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import {
  buildZonesFromPreset,
  PHRASE_COLOR_SWATCHES,
  ZONE_PRESETS,
  ZonePresetDefinition,
} from '../data/initialProjects';
import {
  PlatformPreviewMode,
  SavedProfile,
  SavedStyle,
  StudioStep,
  TemplateProject,
  TextAlignment,
  VariationsConfig,
  ZoneItem,
  ZoneKind,
  ZoneMediaItem,
} from '../types/template';
import { renderVariationToVideo } from '../utils/renderEngine';
import { computeVariationsSummary } from '../utils/variations';
import {
  RenderJobItem,
  RenderQueueStep,
  SocialPlatformId,
} from './RenderQueueStep';
import { TemplatePreviewCard } from './TemplatePreviewCard';
import { ZoneMediaCard } from './ZoneMediaCard';

interface TemplateStudioProps {
  project: TemplateProject;
  savedProfiles: SavedProfile[];
  savedStyles: SavedStyle[];
  onChangeProject: (updated: TemplateProject) => void;
  onSaveProjectAndExit: (updated: TemplateProject) => void;
  onSaveProfilePreset: (profile: Omit<SavedProfile, 'id'>) => void;
  onSaveStylePreset: (style: Omit<SavedStyle, 'id'>) => void;
  onBack: () => void;
}

const STEPS: { id: StudioStep; label: string }[] = [
  { id: 1, label: '1. Perfil' },
  { id: 2, label: '2. Zonas' },
  { id: 3, label: '3. Frases' },
  { id: 4, label: '4. Mídia' },
  { id: 5, label: '5. Estilo' },
  { id: 6, label: '6. Variações' },
  { id: 7, label: '7. Gerar' },
];

const FONT_STYLE_OPTIONS: {
  value: `${TemplateProject['style']['fontFamily']}|${TemplateProject['style']['fontWeight']}`;
  label: string;
}[] = [
  { value: 'Plus Jakarta Sans|700', label: 'Plus Jakarta Sans Bold' },
  { value: 'Plus Jakarta Sans|600', label: 'Plus Jakarta Sans Semibold' },
  { value: 'Plus Jakarta Sans|500', label: 'Plus Jakarta Sans Média' },
  { value: 'Outfit|700', label: 'Outfit Bold' },
  { value: 'Outfit|600', label: 'Outfit Semibold' },
  { value: 'DM Sans|700', label: 'DM Sans Bold' },
  { value: 'DM Sans|600', label: 'DM Sans Semibold' },
  { value: 'Archivo|700', label: 'Archivo Bold' },
  { value: 'Archivo|600', label: 'Archivo Semibold' },
];

export const TemplateStudio: React.FC<TemplateStudioProps> = ({
  project,
  savedProfiles,
  savedStyles,
  onChangeProject,
  onSaveProjectAndExit,
  onSaveProfilePreset,
  onSaveStylePreset,
  onBack,
}) => {
  const [activeStep, setActiveStep] = useState<StudioStep>(1);
  const [platformMode, setPlatformMode] = useState<PlatformPreviewMode>('clean');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [profileSavedToast, setProfileSavedToast] = useState(false);
  const [styleSavedToast, setStyleSavedToast] = useState(false);
  const [ideaPrompt, setIdeaPrompt] = useState('');
  const [suggestionCount, setSuggestionCount] = useState(5);
  const [isGeneratingPhrases, setIsGeneratingPhrases] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [manualPhraseInput, setManualPhraseInput] = useState('');
  const [editingPhraseIdx, setEditingPhraseIdx] = useState<number | null>(null);
  const [draggedZoneIndex, setDraggedZoneIndex] = useState<number | null>(null);
  const [pendingZoneTarget, setPendingZoneTarget] = useState<{
    slotKey: string;
    kind: 'video' | 'image';
  } | null>(null);
  const [renderJobs, setRenderJobs] = useState<RenderJobItem[]>([]);
  const [publishModalTarget, setPublishModalTarget] = useState<{
    mode: 'all' | 'single';
    variationIds: string[];
    preselectedPlatforms: SocialPlatformId[];
  } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const zoneMediaInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const renderRunIdRef = useRef(0);
  const latestProjectRef = useRef(project);
  latestProjectRef.current = project;

  const updateProfile = (patch: Partial<TemplateProject['profile']>) => {
    onChangeProject({
      ...project,
      profile: { ...project.profile, ...patch },
    });
  };

  const updateAppearance = (patch: Partial<TemplateProject['appearance']>) => {
    onChangeProject({
      ...project,
      appearance: { ...project.appearance, ...patch },
    });
  };

  const updateZones = (patch: Partial<TemplateProject['zones']>) => {
    onChangeProject({
      ...project,
      zones: { ...project.zones, ...patch },
    });
  };

  const updatePhrases = (patch: Partial<TemplateProject['phrases']>) => {
    onChangeProject({
      ...project,
      phrases: { ...project.phrases, ...patch },
    });
  };

  const updateMedia = (patch: Partial<TemplateProject['media']>) => {
    onChangeProject({
      ...project,
      media: { ...project.media, ...patch },
    });
  };

  const updateStyle = (patch: Partial<TemplateProject['style']>) => {
    onChangeProject({
      ...project,
      style: { ...project.style, ...patch },
    });
  };

  const variationsConfig: VariationsConfig = {
    combineMode: project.variationsConfig?.combineMode ?? 'cross',
    stripMetadata: project.variationsConfig?.stripMetadata ?? true,
    antiDuplicate: project.variationsConfig?.antiDuplicate ?? true,
  };

  const updateVariationsConfig = (patch: Partial<VariationsConfig>) => {
    onChangeProject({
      ...project,
      variationsConfig: { ...variationsConfig, ...patch },
    });
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateProfile({ avatarUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const probeVideoDuration = (url: string): Promise<number> =>
    new Promise((resolve) => {
      const temp = document.createElement('video');
      temp.preload = 'metadata';
      temp.onloadedmetadata = () => {
        const dur = Number.isFinite(temp.duration) && temp.duration > 0 ? temp.duration : 10;
        resolve(Number(dur.toFixed(1)));
      };
      temp.onerror = () => resolve(10);
      temp.src = url;
    });

  const captureVideoCoverThumb = (url: string): Promise<string> =>
    new Promise((resolve) => {
      const vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      const timer = window.setTimeout(() => resolve(''), 2500);
      vid.onloadeddata = () => {
        const seekAt = Number.isFinite(vid.duration) && vid.duration > 0.6 ? 0.4 : 0;
        vid.onseeked = () => {
          window.clearTimeout(timer);
          try {
            const c = document.createElement('canvas');
            c.width = 270;
            c.height = 480;
            const cctx = c.getContext('2d');
            if (cctx && vid.videoWidth && vid.videoHeight) {
              const srcAspect = vid.videoWidth / vid.videoHeight;
              const dstAspect = c.width / c.height;
              let dw = c.width;
              let dh = c.height;
              if (srcAspect > dstAspect) {
                dh = c.height;
                dw = c.height * srcAspect;
              } else {
                dw = c.width;
                dh = c.width / srcAspect;
              }
              cctx.drawImage(vid, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
              resolve(c.toDataURL('image/jpeg', 0.78));
              return;
            }
          } catch {
            // Ignore canvas errors
          }
          resolve('');
        };
        vid.currentTime = seekAt;
      };
      vid.onerror = () => {
        window.clearTimeout(timer);
        resolve('');
      };
      vid.src = url;
    });

  const handleAddFilesToZone = async (
    slotKey: string,
    kind: 'video' | 'image',
    fileList: FileList
  ) => {
    const files = Array.from(fileList).filter((f) =>
      kind === 'video' ? f.type.startsWith('video/') : f.type.startsWith('image/')
    );
    if (files.length === 0) return;

    const createdItems: ZoneMediaItem[] = await Promise.all(
      files.map(async (file, idx) => {
        const id = `media-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
        if (kind === 'video') {
          const url = URL.createObjectURL(file);
          const durationSec = await probeVideoDuration(url);
          return {
            id,
            url,
            name: file.name,
            kind: 'video',
            durationSec,
            trimStart: 0,
            trimEnd: durationSec,
            zoom: 1,
            panX: 50,
            panY: 50,
          };
        }

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.readAsDataURL(file);
        });
        return {
          id,
          url: dataUrl,
          name: file.name,
          kind: 'image',
          durationSec: 0,
          trimStart: 0,
          trimEnd: 0,
          zoom: 1,
          panX: 50,
          panY: 50,
        };
      })
    );

    const existingList = project.media.zoneMediaItems?.[slotKey] ?? [];
    const nextList = [...existingList, ...createdItems];
    const selectedId = project.media.selectedZoneMediaId?.[slotKey] ?? createdItems[0].id;
    const activeItem = nextList.find((i) => i.id === selectedId) ?? createdItems[0];

    const primaryVideoZone = project.zones.items.find((z) => z.kind === 'video');
    const isPrimaryVideo = kind === 'video' && (!primaryVideoZone || slotKey === primaryVideoZone.id);

    let nextCover = project.coverImageUrl;
    if (isPrimaryVideo && activeItem.kind === 'video') {
      const thumb = await captureVideoCoverThumb(activeItem.url);
      if (thumb) nextCover = thumb;
    } else if (!nextCover && activeItem.kind === 'image') {
      nextCover = activeItem.url;
    }

    onChangeProject({
      ...project,
      coverImageUrl: nextCover,
      media: {
        ...project.media,
        zoneMediaItems: {
          ...(project.media.zoneMediaItems ?? {}),
          [slotKey]: nextList,
        },
        selectedZoneMediaId: {
          ...(project.media.selectedZoneMediaId ?? {}),
          [slotKey]: selectedId,
        },
        zoneAssets: {
          ...(project.media.zoneAssets ?? {}),
          [slotKey]: { url: activeItem.url, name: activeItem.name, kind },
        },
        videoUrl: isPrimaryVideo ? activeItem.url : project.media.videoUrl,
        videoName: isPrimaryVideo ? activeItem.name : project.media.videoName,
        secondaryImageUrl: kind === 'image' ? activeItem.url : project.media.secondaryImageUrl,
      },
    });
  };

  const handleSelectZoneMediaItem = (slotKey: string, itemId: string) => {
    const list = project.media.zoneMediaItems?.[slotKey] ?? [];
    const item = list.find((i) => i.id === itemId);
    if (!item) return;

    const primaryVideoZone = project.zones.items.find((z) => z.kind === 'video');
    const isPrimaryVideo =
      item.kind === 'video' && (!primaryVideoZone || slotKey === primaryVideoZone.id);

    updateMedia({
      selectedZoneMediaId: {
        ...(project.media.selectedZoneMediaId ?? {}),
        [slotKey]: itemId,
      },
      zoneAssets: {
        ...(project.media.zoneAssets ?? {}),
        [slotKey]: { url: item.url, name: item.name, kind: item.kind },
      },
      videoUrl: isPrimaryVideo ? item.url : project.media.videoUrl,
      videoName: isPrimaryVideo ? item.name : project.media.videoName,
    });
  };

  const handleUpdateZoneMediaItem = (
    slotKey: string,
    itemId: string,
    patch: Partial<ZoneMediaItem>
  ) => {
    const list = project.media.zoneMediaItems?.[slotKey] ?? [];
    const updatedList = list.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
    updateMedia({
      zoneMediaItems: {
        ...(project.media.zoneMediaItems ?? {}),
        [slotKey]: updatedList,
      },
    });
  };

  const handleRemoveZoneMediaItem = (slotKey: string, itemId: string) => {
    const list = project.media.zoneMediaItems?.[slotKey] ?? [];
    const nextList = list.filter((item) => item.id !== itemId);
    const currentSelectedId = project.media.selectedZoneMediaId?.[slotKey];
    const nextSelected =
      currentSelectedId === itemId ? nextList[0]?.id : currentSelectedId;
    const nextActiveItem = nextList.find((i) => i.id === nextSelected) ?? nextList[0];

    const nextZoneAssets = { ...(project.media.zoneAssets ?? {}) };
    if (nextActiveItem) {
      nextZoneAssets[slotKey] = {
        url: nextActiveItem.url,
        name: nextActiveItem.name,
        kind: nextActiveItem.kind,
      };
    } else {
      delete nextZoneAssets[slotKey];
    }

    const nextSelectedMap = { ...(project.media.selectedZoneMediaId ?? {}) };
    if (nextSelected) {
      nextSelectedMap[slotKey] = nextSelected;
    } else {
      delete nextSelectedMap[slotKey];
    }

    const primaryVideoZone = project.zones.items.find((z) => z.kind === 'video');
    const isPrimaryVideo = primaryVideoZone?.id === slotKey;

    updateMedia({
      zoneMediaItems: {
        ...(project.media.zoneMediaItems ?? {}),
        [slotKey]: nextList,
      },
      selectedZoneMediaId: nextSelectedMap,
      zoneAssets: nextZoneAssets,
      videoUrl: isPrimaryVideo ? nextActiveItem?.url ?? null : project.media.videoUrl,
      videoName: isPrimaryVideo ? nextActiveItem?.name ?? null : project.media.videoName,
    });
  };

  const handleVideoFile = (file: File | undefined, targetSlotKey?: string) => {
    if (!file || !file.type.startsWith('video/')) return;
    const primaryVideoZone = project.zones.items.find((z) => z.kind === 'video');
    const slotKey = targetSlotKey ?? primaryVideoZone?.id ?? 'default-video';
    const dt = new DataTransfer();
    dt.items.add(file);
    void handleAddFilesToZone(slotKey, 'video', dt.files);
  };

  const handleZoneMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !pendingZoneTarget) return;
    void handleAddFilesToZone(pendingZoneTarget.slotKey, pendingZoneTarget.kind, files);
    e.target.value = '';
  };

  const triggerZoneUpload = (slotKey: string, kind: 'video' | 'image') => {
    setPendingZoneTarget({ slotKey, kind });
    setTimeout(() => {
      if (zoneMediaInputRef.current) {
        zoneMediaInputRef.current.accept = kind === 'video' ? 'video/*' : 'image/*';
        zoneMediaInputRef.current.click();
      }
    }, 0);
  };

  const handleApplyPreset = (preset: ZonePresetDefinition) => {
    const newItems = buildZonesFromPreset(preset.id);
    // Preserve primary uploaded video onto the first video zone if one exists
    const nextZoneAssets = { ...(project.media.zoneAssets ?? {}) };
    const firstVideo = newItems.find((z) => z.kind === 'video');
    if (firstVideo && project.media.videoUrl && project.media.videoName) {
      nextZoneAssets[firstVideo.id] = {
        url: project.media.videoUrl,
        name: project.media.videoName,
        kind: 'video',
      };
    }

    onChangeProject({
      ...project,
      zones: {
        ...project.zones,
        presetId: preset.id,
        blurBackground: preset.blurBackground,
        items: newItems,
      },
      media: {
        ...project.media,
        zoneAssets: nextZoneAssets,
      },
    });
  };

  const handleUpdateZoneItem = (index: number, patch: Partial<ZoneItem>) => {
    const updated = project.zones.items.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item
    );
    updateZones({
      presetId: 'custom',
      items: updated,
    });
  };

  const handleAddZone = () => {
    const newItem: ZoneItem = {
      id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'video',
      weight: 1.0,
    };
    updateZones({
      presetId: 'custom',
      items: [...project.zones.items, newItem],
    });
  };

  const handleRemoveZone = (index: number) => {
    if (project.zones.items.length <= 1) return;
    updateZones({
      presetId: 'custom',
      items: project.zones.items.filter((_, idx) => idx !== index),
    });
  };

  const handleReorderZones = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= project.zones.items.length) return;
    const copy = [...project.zones.items];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    updateZones({
      presetId: 'custom',
      items: copy,
    });
  };

  const handleSaveProfileClick = () => {
    onSaveProfilePreset({
      name: project.profile.name || 'Perfil sem nome',
      handle: project.profile.handle || 'seuhandle',
      verified: project.profile.verified,
      avatarUrl: project.profile.avatarUrl,
      textAlign: project.profile.textAlign,
      theme: project.profile.theme,
    });
    setProfileSavedToast(true);
    setTimeout(() => setProfileSavedToast(false), 2000);
  };

  const effectivePhraseColor =
    project.style.phraseColor ?? (project.profile.theme === 'light' ? '#0F1419' : '#FFFFFF');

  const handleSaveStyleClick = () => {
    const weightLabel =
      project.style.fontWeight === '700'
        ? 'Bold'
        : project.style.fontWeight === '600'
          ? 'Semibold'
          : 'Média';
    onSaveStylePreset({
      name: `${project.style.fontFamily} ${weightLabel}`,
      fontFamily: project.style.fontFamily,
      fontWeight: project.style.fontWeight,
      phraseColor: effectivePhraseColor,
      strokeEnabled: project.style.strokeEnabled,
      strokeColor: project.style.strokeColor,
      strokeWidth: project.style.strokeWidth,
      phraseFontSize: project.appearance.phraseFontSize,
      horizontalPadding: project.appearance.horizontalPadding,
      topSpacing: project.appearance.topSpacing,
    });
    setStyleSavedToast(true);
    setTimeout(() => setStyleSavedToast(false), 2000);
  };

  const handleSelectSavedStyle = (styleId: string) => {
    const found = savedStyles.find((s) => s.id === styleId);
    if (!found) return;
    onChangeProject({
      ...project,
      style: {
        ...project.style,
        fontFamily: found.fontFamily,
        fontWeight: found.fontWeight,
        phraseColor: found.phraseColor,
        strokeEnabled: found.strokeEnabled,
        strokeColor: found.strokeColor,
        strokeWidth: found.strokeWidth,
      },
      appearance: {
        ...project.appearance,
        phraseFontSize: found.phraseFontSize,
        horizontalPadding: found.horizontalPadding,
        topSpacing: found.topSpacing,
      },
    });
  };

  const handleSelectSavedProfile = (profileId: string) => {
    const found = savedProfiles.find((p) => p.id === profileId);
    if (!found) return;
    updateProfile({
      name: found.name,
      handle: found.handle,
      verified: found.verified,
      avatarUrl: found.avatarUrl,
      textAlign: found.textAlign,
      theme: found.theme,
    });
  };

  const handleGeneratePhrases = async () => {
    const trimmed = ideaPrompt.trim();
    if (!trimmed) {
      setGenerateError('Descreva a ideia do vídeo antes de gerar.');
      return;
    }

    setIsGeneratingPhrases(true);
    setGenerateError(null);

    try {
      const response = await fetch('/api/generate-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: trimmed,
          count: suggestionCount,
          templateType: project.templateType,
        }),
      });

      const data = (await response.json()) as { phrases?: string[]; error?: string };
      if (!response.ok || !Array.isArray(data.phrases)) {
        setGenerateError(data.error ?? 'Não foi possível gerar frases no momento.');
        return;
      }

      const existing = project.phrases.variations;
      const merged = [...existing, ...data.phrases];
      const nextActiveIdx = existing.length === 0 ? 0 : project.phrases.activeVariationIndex;
      updatePhrases({
        variations: merged,
        activeVariationIndex: nextActiveIdx,
        mainPhrase: merged[nextActiveIdx] ?? '',
      });
    } catch {
      setGenerateError('Erro de conexão com o servidor ao gerar sugestões.');
    } finally {
      setIsGeneratingPhrases(false);
    }
  };

  const handleAddManualPhrase = () => {
    const trimmed = manualPhraseInput.trim();
    if (!trimmed) return;
    const nextVars = [...project.phrases.variations, trimmed];
    const nextIdx = nextVars.length - 1;
    updatePhrases({
      variations: nextVars,
      activeVariationIndex: nextIdx,
      mainPhrase: trimmed,
    });
    setManualPhraseInput('');
  };

  const handlePrimaryCta = () => {
    if (activeStep < 7) {
      setActiveStep((prev) => (prev + 1) as StudioStep);
    } else {
      const finalized: TemplateProject = {
        ...project,
        status: 'pronto',
        updatedAtLabel: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      };
      onSaveProjectAndExit(finalized);
    }
  };

  const handleDownloadRenderedJob = (job: RenderJobItem, index: number) => {
    const url = job.output?.videoUrl ?? job.output?.fallbackImageUrl;
    if (!url) return;
    const ext = job.output?.videoUrl ? job.output.extension : 'png';
    const baseName =
      project.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-') || 'scaleclip-video';
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}-variacao-${index + 1}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllRendered = () => {
    const completed = renderJobs.filter((j) => j.status === 'done');
    completed.forEach((job, idx) => {
      window.setTimeout(() => {
        handleDownloadRenderedJob(job, idx);
      }, idx * 240);
    });
  };

  const handleMarkPublished = (variationIds: string[], platforms: SocialPlatformId[]) => {
    setRenderJobs((prev) =>
      prev.map((job) => {
        if (!variationIds.includes(job.variation.id)) return job;
        const merged = Array.from(
          new Set([...(job.publishedPlatforms ?? []), ...platforms])
        );
        return { ...job, publishedPlatforms: merged };
      })
    );
  };

  const renderSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (val: number) => void
  ) => {
    const pct = ((value - min) / (max - min)) * 100;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-700">{label}</span>
          <span className="font-mono-tabular text-slate-500">{value}px</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #E6198E 0%, #E6198E ${pct}%, #E2E8F0 ${pct}%, #E2E8F0 100%)`,
          }}
          className="studio-slider"
        />
      </div>
    );
  };

  const renderPresetSchematic = (preset: ZonePresetDefinition) => {
    const totalWeight = preset.items.reduce((acc, i) => acc + i.weight, 0);

    return (
      <div className="w-[46px] aspect-[9/16] rounded-md border border-slate-200 bg-white overflow-hidden shrink-0 flex flex-col relative">
        {preset.blurBackground && (
          <div className="absolute inset-0 bg-[#5C0838]" />
        )}

        {/* Mini Tweet Header Strip */}
        <div
          className={`relative z-10 px-1.5 pt-1.5 pb-1 flex items-center gap-1 shrink-0 ${
            preset.blurBackground ? 'bg-transparent' : 'bg-white'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              preset.blurBackground ? 'bg-white/40' : 'bg-slate-200'
            }`}
          />
          <div className="flex-1 space-y-0.5">
            <div
              className={`h-0.5 w-5 rounded-full ${
                preset.blurBackground ? 'bg-white/60' : 'bg-slate-300'
              }`}
            />
            <div
              className={`h-0.5 w-3 rounded-full ${
                preset.blurBackground ? 'bg-white/35' : 'bg-slate-200'
              }`}
            />
          </div>
        </div>

        {/* Mini Stacked Zones */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-[1px] px-0">
          {preset.items.map((item, idx) => {
            const grow = item.weight / totalWeight;
            if (item.kind === 'video') {
              return (
                <div
                  key={idx}
                  style={{ flexGrow: grow, flexBasis: 0 }}
                  className={`flex items-center justify-center ${
                    preset.blurBackground ? 'mx-1 my-0.5 rounded-[2px]' : ''
                  } bg-[#E6198E] text-white`}
                >
                  <Video className="w-2.5 h-2.5" />
                </div>
              );
            }
            if (item.kind === 'image') {
              return (
                <div
                  key={idx}
                  style={{ flexGrow: grow, flexBasis: 0 }}
                  className="bg-[#C01276] text-white flex items-center justify-center"
                >
                  <ImageIcon className="w-2.5 h-2.5" />
                </div>
              );
            }
            if (item.kind === 'split_images') {
              return (
                <div
                  key={idx}
                  style={{ flexGrow: grow, flexBasis: 0 }}
                  className="grid grid-cols-2 gap-[1px]"
                >
                  <div className="bg-[#C01276] text-white flex items-center justify-center">
                    <ImageIcon className="w-2 h-2" />
                  </div>
                  <div className="bg-[#C01276] text-white flex items-center justify-center">
                    <ImageIcon className="w-2 h-2" />
                  </div>
                </div>
              );
            }
            return (
              <div
                key={idx}
                style={{ flexGrow: grow, flexBasis: 0 }}
                className="bg-white border-t border-slate-100"
              />
            );
          })}
        </div>
      </div>
    );
  };

  const variationsSummary = useMemo(
    () => computeVariationsSummary(project, variationsConfig.combineMode),
    [project, variationsConfig.combineMode]
  );

  const activeVariationsCount =
    variationsConfig.combineMode === 'cross'
      ? variationsSummary.crossTotal
      : variationsSummary.uniqueTotal;

  // Sequentially render each variation to playable WebM when entering Step 7
  useEffect(() => {
    if (activeStep !== 7) {
      renderRunIdRef.current += 1;
      return;
    }

    const runId = ++renderRunIdRef.current;
    const currentProject = latestProjectRef.current;
    const mode = currentProject.variationsConfig?.combineMode ?? 'cross';
    const { variations } = computeVariationsSummary(currentProject, mode);

    const initialJobs: RenderJobItem[] = variations.map((variation) => ({
      variation,
      status: 'queued',
    }));
    setRenderJobs(initialJobs);

    const runQueue = async () => {
      for (let i = 0; i < initialJobs.length; i++) {
        if (renderRunIdRef.current !== runId) return;

        setRenderJobs((prev) =>
          prev.map((job, idx) =>
            idx === i ? { ...job, status: 'rendering', progress: 0 } : job
          )
        );

        const output = await renderVariationToVideo(
          initialJobs[i].variation.projectSlice,
          {
            variationIndex: i,
            shouldAbort: () => renderRunIdRef.current !== runId,
            onProgress: (percent) => {
              if (renderRunIdRef.current !== runId) return;
              setRenderJobs((prev) =>
                prev.map((job, idx) =>
                  idx === i ? { ...job, progress: percent } : job
                )
              );
            },
          }
        );

        if (renderRunIdRef.current !== runId) {
          if (output.videoUrl) URL.revokeObjectURL(output.videoUrl);
          return;
        }

        setRenderJobs((prev) =>
          prev.map((job, idx) =>
            idx === i ? { ...job, status: 'done', output } : job
          )
        );
      }

      if (renderRunIdRef.current === runId) {
        onChangeProject({
          ...latestProjectRef.current,
          status: 'pronto',
          updatedAtLabel: new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
          }),
        });
      }
    };

    void runQueue();

    return () => {
      renderRunIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);

  const allRenderDone =
    renderJobs.length > 0 && renderJobs.every((j) => j.status === 'done');

  const ctaLabel =
    activeStep === 1
      ? 'Salvar perfil e continuar'
      : activeStep === 2
        ? 'Salvar layout e continuar'
        : activeStep === 3 || activeStep === 4 || activeStep === 6
          ? 'Continuar'
          : activeStep === 5
            ? 'Salvar estilo e continuar'
            : 'Salvar projeto';

  // Compute media slots needed in Step 4 based on current zones
  const mediaSlotsNeeded = project.zones.items.flatMap<{
    zoneNumber: number;
    slotKey: string;
    label: string;
    kind: 'video' | 'image';
  }>((zone, idx) => {
    const num = idx + 1;
    if (zone.kind === 'video') {
      return [{ zoneNumber: num, slotKey: zone.id, label: `Zona ${num}: vídeo`, kind: 'video' }];
    }
    if (zone.kind === 'image') {
      return [{ zoneNumber: num, slotKey: zone.id, label: `Zona ${num}: imagem`, kind: 'image' }];
    }
    if (zone.kind === 'split_images') {
      return [
        {
          zoneNumber: num,
          slotKey: `${zone.id}-left`,
          label: `Zona ${num}: imagem esquerda`,
          kind: 'image',
        },
        {
          zoneNumber: num,
          slotKey: `${zone.id}-right`,
          label: `Zona ${num}: imagem direita`,
          kind: 'image',
        },
      ];
    }
    return [];
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9FB]">
      {/* Hidden file inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarUpload}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleVideoFile(e.target.files?.[0])}
        className="hidden"
      />
      <input
        ref={zoneMediaInputRef}
        type="file"
        multiple
        onChange={handleZoneMediaUpload}
        className="hidden"
      />

      {/* Global Top Bar with Stepper */}
      <div className="px-6 pt-5 pb-3 max-w-[1440px] w-full mx-auto">
        <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar para Templates"
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="w-8 h-8 rounded-lg bg-[#E6198E] text-white flex items-center justify-center shrink-0">
              <LayoutGrid className="w-4 h-4" />
            </div>

            <span className="font-display text-sm font-bold text-slate-900 whitespace-nowrap">
              Templates
            </span>

            {isEditingTitle ? (
              <input
                type="text"
                autoFocus
                value={project.title}
                onChange={(e) => onChangeProject({ ...project, title: e.target.value })}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingTitle(false);
                }}
                className="px-2.5 py-1 text-xs font-medium border border-[#E6198E] rounded-lg focus:outline-none text-slate-900 w-36"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 text-xs font-medium text-slate-700 max-w-[160px] cursor-pointer"
              >
                <span className="truncate">{project.title}</span>
                <Pencil className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            )}
          </div>

          {/* Center & Right: Either Render Status Header (Step 7) or 7-Step Wizard + CTA */}
          {activeStep === 7 ? (
            <div className="flex flex-wrap items-center gap-3 ml-auto">
              <span className="text-xs text-slate-500">
                Este projeto já foi enviado pra render. Acompanhe o progresso abaixo.
              </span>

              {allRenderDone && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setPublishModalTarget({
                        mode: 'all',
                        variationIds: renderJobs.map((j) => j.variation.id),
                        preselectedPlatforms: ['instagram', 'tiktok'],
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Publicar tudo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadAllRendered}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar tudo</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <nav
                aria-label="Etapas do template"
                className="flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-full p-1 overflow-x-auto max-w-full"
              >
                {STEPS.map((step) => {
                  const isActive = activeStep === step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveStep(step.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-[#E6198E] text-white font-semibold shadow-xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </nav>

              <button
                type="button"
                onClick={handlePrimaryCta}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{ctaLabel}</span>
                {activeStep === 4 && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="px-6 pb-8 max-w-[1440px] w-full mx-auto flex flex-col lg:flex-row items-start gap-6">
        {/* Left Controls Column */}
        <div className="flex-1 w-full space-y-5 min-w-0">
          {/* STEP 1: PERFIL */}
          {activeStep === 1 && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Perfil do tweet
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Esses dados aparecem no cabeçalho do card, igual um tweet de verdade: nome, @handle, selo de verificado e avatar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveProfileClick}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 shrink-0 cursor-pointer transition-colors"
                >
                  {profileSavedToast ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Perfil salvo</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5 text-slate-500" />
                      <span>Salvar perfil</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-1 space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">Avatar</label>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Enviar imagem de avatar"
                    className="w-10 h-10 rounded-full border border-slate-200 hover:border-[#E6198E] bg-slate-50 flex items-center justify-center overflow-hidden cursor-pointer transition-colors"
                  >
                    {project.profile.avatarUrl ? (
                      <img
                        src={project.profile.avatarUrl}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Upload className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">Verificado</label>
                  <div className="h-10 flex items-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={project.profile.verified}
                      onClick={() => updateProfile({ verified: !project.profile.verified })}
                      className={`w-10 h-6 rounded-full transition-colors p-0.5 cursor-pointer ${
                        project.profile.verified ? 'bg-[#E6198E]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          project.profile.verified ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="md:col-span-5 space-y-1.5">
                  <label htmlFor="profile-name" className="block text-xs font-medium text-slate-700">
                    Nome
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    value={project.profile.name}
                    onChange={(e) => updateProfile({ name: e.target.value })}
                    placeholder="Ex.: João Pedro"
                    className="w-full h-10 px-3.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 transition-all"
                  />
                </div>

                <div className="md:col-span-4 space-y-1.5">
                  <label htmlFor="profile-handle" className="block text-xs font-medium text-slate-700">
                    @handle
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      @
                    </span>
                    <input
                      id="profile-handle"
                      type="text"
                      value={project.profile.handle}
                      onChange={(e) => updateProfile({ handle: e.target.value.replace(/^@/, '') })}
                      placeholder="seuhandle"
                      className="w-full h-10 pl-8 pr-3.5 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-3 space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Alinhamento do texto
                  </label>
                  <div className="inline-flex items-center gap-1">
                    {(
                      [
                        { id: 'left', icon: <AlignLeft className="w-4 h-4" />, label: 'Esquerda' },
                        { id: 'center', icon: <AlignCenter className="w-4 h-4" />, label: 'Centro' },
                        { id: 'right', icon: <AlignRight className="w-4 h-4" />, label: 'Direita' },
                      ] as { id: TextAlignment; icon: React.ReactNode; label: string }[]
                    ).map((align) => {
                      const active = project.profile.textAlign === align.id;
                      return (
                        <button
                          key={align.id}
                          type="button"
                          aria-label={align.label}
                          onClick={() => updateProfile({ textAlign: align.id })}
                          className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#E6198E] border-[#E6198E] text-white'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {align.icon}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-4 space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">Tema</label>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateProfile({ theme: 'light' })}
                      className={`h-10 px-3.5 rounded-lg border inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        project.profile.theme === 'light'
                          ? 'bg-[#E6198E] border-[#E6198E] text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>Claro</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateProfile({ theme: 'dark' })}
                      className={`h-10 px-3.5 rounded-lg border inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        project.profile.theme === 'dark'
                          ? 'bg-[#E6198E] border-[#E6198E] text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Escuro</span>
                    </button>
                  </div>
                </div>

                <div className="md:col-span-5 space-y-1.5">
                  <label htmlFor="saved-profile-select" className="block text-xs font-medium text-slate-700">
                    Escolher perfil salvo
                  </label>
                  <select
                    id="saved-profile-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) handleSelectSavedProfile(e.target.value);
                    }}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-[#E6198E] cursor-pointer"
                  >
                    <option value="" disabled>
                      Escolher perfil salvo
                    </option>
                    {savedProfiles.map((prof) => (
                      <option key={prof.id} value={prof.id}>
                        {prof.name} (@{prof.handle})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-5 border-t border-slate-100 space-y-4">
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    Aparência do card
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Avatar, tipografia e espaçamentos. Cor, traçado e família da fonte da frase ficam em Estilo.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                  {renderSlider('Tamanho do avatar', project.appearance.avatarSize, 80, 240, (v) =>
                    updateAppearance({ avatarSize: v })
                  )}
                  {renderSlider('Fonte do nome', project.appearance.nameFontSize, 28, 76, (v) =>
                    updateAppearance({ nameFontSize: v })
                  )}
                  {renderSlider('Fonte do @handle', project.appearance.handleFontSize, 24, 60, (v) =>
                    updateAppearance({ handleFontSize: v })
                  )}
                  {renderSlider('Tamanho da frase', project.appearance.phraseFontSize, 32, 84, (v) =>
                    updateAppearance({ phraseFontSize: v })
                  )}
                  {renderSlider('Espaçamento lateral', project.appearance.horizontalPadding, 24, 150, (v) =>
                    updateAppearance({ horizontalPadding: v })
                  )}
                  {renderSlider('Espaço acima do perfil', project.appearance.topSpacing, 40, 240, (v) =>
                    updateAppearance({ topSpacing: v })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: ZONAS (EXACTLY MATCHING NEW SCREENSHOT) */}
          {activeStep === 2 && (
            <>
              {/* Card 1: Como vai ser o seu layout? */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-5">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Como vai ser o seu layout?
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Defina as zonas de mídia empilhadas abaixo do card do tweet: cada zona recebe vídeo, imagem ou fica em branco, com a altura relativa que você quiser (não precisa somar 100%, a gente normaliza). Zonas lado a lado (divididas na horizontal) vêm prontas nos presets abaixo.
                  </p>
                </div>

                {/* Stacked Zone Rows */}
                <div className="space-y-2.5">
                  {project.zones.items.map((zone, index) => {
                    const weightPct = ((zone.weight - 0.2) / (2.5 - 0.2)) * 100;

                    return (
                      <div
                        key={zone.id}
                        draggable
                        onDragStart={() => setDraggedZoneIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedZoneIndex !== null) {
                            handleReorderZones(draggedZoneIndex, index);
                            setDraggedZoneIndex(null);
                          }
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 flex flex-wrap sm:flex-nowrap items-center gap-3 hover:border-slate-300 transition-colors"
                      >
                        {/* Pink Index Badge */}
                        <span className="w-6 h-6 rounded-full bg-[#E6198E] text-white text-xs font-mono-tabular font-bold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>

                        {/* Zone Kind Selector */}
                        {zone.kind === 'split_images' ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E6198E] text-white text-xs font-semibold">
                              <Columns2 className="w-3.5 h-3.5" />
                              2 imagens lado a lado
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateZoneItem(index, { kind: 'image' })}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                              1 imagem
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 shrink-0">
                            {(
                              [
                                { id: 'video', label: 'Vídeo', icon: <Video className="w-3.5 h-3.5" /> },
                                { id: 'image', label: 'Imagem', icon: <ImageIcon className="w-3.5 h-3.5" /> },
                                { id: 'empty', label: 'Vazio', icon: <Square className="w-3.5 h-3.5" /> },
                              ] as { id: ZoneKind; label: string; icon: React.ReactNode }[]
                            ).map((opt) => {
                              const isSelected = zone.kind === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => handleUpdateZoneItem(index, { kind: opt.id })}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#E6198E] border-[#E6198E] text-white'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {opt.icon}
                                  <span>{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Relative Height Slider */}
                        <div className="flex-1 min-w-[140px] px-1">
                          <input
                            type="range"
                            min={0.2}
                            max={2.5}
                            step={0.05}
                            value={zone.weight}
                            onChange={(e) =>
                              handleUpdateZoneItem(index, { weight: Number(e.target.value) })
                            }
                            style={{
                              background: `linear-gradient(to right, #E6198E 0%, #E6198E ${weightPct}%, #E2E8F0 ${weightPct}%, #E2E8F0 100%)`,
                            }}
                            className="studio-slider"
                            aria-label={`Altura relativa da zona ${index + 1}`}
                          />
                        </div>

                        {/* Numeric Weight */}
                        <span className="text-xs font-mono-tabular text-slate-700 w-10 text-right shrink-0">
                          {zone.weight.toFixed(2)}
                        </span>

                        {/* Delete & Reorder */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRemoveZone(index)}
                            disabled={project.zones.items.length <= 1}
                            title="Remover zona"
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextIdx = index === 0 ? project.zones.items.length - 1 : index - 1;
                              handleReorderZones(index, nextIdx);
                            }}
                            title="Arrastar ou clicar para reordenar"
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* + Adicionar zona */}
                  <button
                    type="button"
                    onClick={handleAddZone}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:border-[#E6198E]/50 hover:bg-pink-50/30 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar zona</span>
                  </button>
                </div>

                {/* Extra quick options (Fit & Radius) */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-600">Enquadramento:</span>
                    <button
                      type="button"
                      onClick={() => updateZones({ videoFit: 'cover' })}
                      className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer ${
                        project.zones.videoFit === 'cover'
                          ? 'bg-[#E6198E] border-[#E6198E] text-white'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Preencher (Cover)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateZones({ videoFit: 'contain' })}
                      className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer ${
                        project.zones.videoFit === 'contain'
                          ? 'bg-[#E6198E] border-[#E6198E] text-white'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Inteiro (Contain)
                    </button>
                  </div>

                  <label className="inline-flex items-center gap-2 text-slate-600 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project.zones.blurBackground}
                      onChange={(e) => updateZones({ blurBackground: e.target.checked })}
                      className="accent-[#E6198E] w-3.5 h-3.5"
                    />
                    Fundo com efeito blur
                  </label>
                </div>
              </div>

              {/* Card 2: Presets (9 cards 3x3) */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-4">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">Presets</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Comece de um modelo pronto, você pode ajustar depois.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {ZONE_PRESETS.map((preset) => {
                    const isSelected = project.zones.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset)}
                        className={`text-left rounded-xl border p-3.5 flex items-start gap-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-slate-900 ring-1 ring-slate-900 bg-white shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        {renderPresetSchematic(preset)}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1.5">
                            {isSelected && (
                              <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            )}
                            <h4 className="font-display text-xs font-bold text-slate-900 leading-snug">
                              {preset.title}
                            </h4>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-4">
                            {preset.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* STEP 3: FRASES (MATCHING SCREENSHOT) */}
          {activeStep === 3 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
              {/* Left Card: Gerar automaticamente + Escrever frase */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-6">
                {/* Gerar automaticamente */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#E6198E]/15 text-[#E6198E] text-[10px] font-bold tracking-wide uppercase">
                      RECOMENDADO
                    </span>
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Gerar automaticamente
                    </h2>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Descreva a ideia do vídeo. Geramos frases curtas e fiéis ao que você escreveu — sem inventar história.
                  </p>

                  <textarea
                    rows={3}
                    value={ideaPrompt}
                    onChange={(e) => {
                      setIdeaPrompt(e.target.value);
                      if (generateError) setGenerateError(null);
                    }}
                    placeholder="Ex.: fuga da polícia de moto, clutch 1v4 no heist, NPC bugado no RP"
                    className="w-full p-3 text-xs rounded-xl border border-[#E6198E]/70 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 resize-none"
                  />

                  {generateError && (
                    <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {generateError}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={suggestionCount}
                        onChange={(e) =>
                          setSuggestionCount(Math.min(15, Math.max(1, Number(e.target.value) || 5)))
                        }
                        aria-label="Quantidade de sugestões"
                        className="w-12 h-9 px-2 text-xs font-mono-tabular font-semibold text-center rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-[#E6198E]"
                      />
                      <span className="text-xs text-slate-500">sugestões</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleGeneratePhrases}
                      disabled={isGeneratingPhrases}
                      className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {isGeneratingPhrases ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E6198E]" />
                          <span>Gerando...</span>
                        </>
                      ) : (
                        <span>Gerar</span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5 space-y-2.5">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Escrever frase
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Até 280 caracteres. Essa frase vira o texto do tweet inteiro.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="flex-1 space-y-1">
                      <textarea
                        rows={2}
                        maxLength={280}
                        value={manualPhraseInput}
                        onChange={(e) => setManualPhraseInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddManualPhrase();
                          }
                        }}
                        placeholder="Ex.: Ninguém tava pronto pra isso"
                        className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 resize-none"
                      />
                      {manualPhraseInput.length > 0 && (
                        <p className="text-[11px] font-mono-tabular text-slate-400 text-right">
                          {manualPhraseInput.length}/280
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddManualPhrase}
                      aria-label="Adicionar frase"
                      className="w-10 h-10 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Middle Card: Frases do projeto (N) */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Frases do projeto{' '}
                      <span className="font-normal font-mono-tabular text-slate-400">
                        ({project.phrases.variations.length})
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Depois você sobe a mídia e define o estilo tipográfico com o vídeo em loop.
                    </p>
                  </div>

                  {project.phrases.variations.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        updatePhrases({
                          variations: [],
                          activeVariationIndex: 0,
                          mainPhrase: '',
                        })
                      }
                      className="text-[11px] font-medium text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {project.phrases.variations.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    Nenhuma frase ainda. Escreva ou gere automaticamente ao lado.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
                    {project.phrases.variations.map((phrase, idx) => {
                      const isActive = project.phrases.activeVariationIndex === idx;
                      const isEditing = editingPhraseIdx === idx;

                      return (
                        <div
                          key={`${idx}-${phrase.slice(0, 10)}`}
                          onClick={() => {
                            if (!isEditing) {
                              updatePhrases({
                                activeVariationIndex: idx,
                                mainPhrase: phrase,
                              });
                            }
                          }}
                          className={`rounded-xl border p-3 transition-colors cursor-pointer ${
                            isActive
                              ? 'border-[#E6198E] bg-pink-50/40'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            {isEditing ? (
                              <input
                                type="text"
                                autoFocus
                                maxLength={280}
                                value={phrase}
                                onChange={(e) => {
                                  const next = [...project.phrases.variations];
                                  next[idx] = e.target.value;
                                  updatePhrases({
                                    variations: next,
                                    mainPhrase: isActive ? e.target.value : project.phrases.mainPhrase,
                                  });
                                }}
                                onBlur={() => setEditingPhraseIdx(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') setEditingPhraseIdx(null);
                                }}
                                className="flex-1 text-xs px-2 py-1 rounded border border-[#E6198E] bg-white focus:outline-none"
                              />
                            ) : (
                              <p className="text-xs font-medium text-slate-800 leading-snug flex-1">
                                {phrase}
                              </p>
                            )}

                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setEditingPhraseIdx(isEditing ? null : idx)}
                                title="Editar frase"
                                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVars = project.phrases.variations.filter(
                                    (_, i) => i !== idx
                                  );
                                  const nextIdx = Math.min(
                                    project.phrases.activeVariationIndex,
                                    Math.max(0, nextVars.length - 1)
                                  );
                                  updatePhrases({
                                    variations: nextVars,
                                    activeVariationIndex: nextIdx,
                                    mainPhrase: nextVars[nextIdx] ?? '',
                                  });
                                }}
                                title="Remover frase"
                                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: MÍDIA (MATCHING SCREENSHOTS WITH MULTI-FILE & TRIM/FRAMING) */}
          {activeStep === 4 && (
            <div className="space-y-4">
              {mediaSlotsNeeded.length === 0 ? (
                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Nenhuma zona de vídeo ou imagem configurada
                  </p>
                  <p className="text-xs text-slate-500">
                    Volte na etapa 2. Zonas e adicione pelo menos uma zona de vídeo ou imagem.
                  </p>
                </div>
              ) : (
                mediaSlotsNeeded.map((slot) => (
                  <ZoneMediaCard
                    key={slot.slotKey}
                    zoneNumber={slot.zoneNumber}
                    title={slot.label}
                    kind={slot.kind}
                    items={project.media.zoneMediaItems?.[slot.slotKey] ?? []}
                    selectedId={project.media.selectedZoneMediaId?.[slot.slotKey]}
                    onAddFiles={(files) => void handleAddFilesToZone(slot.slotKey, slot.kind, files)}
                    onSelectItem={(itemId) => handleSelectZoneMediaItem(slot.slotKey, itemId)}
                    onUpdateItem={(itemId, patch) =>
                      handleUpdateZoneMediaItem(slot.slotKey, itemId, patch)
                    }
                    onRemoveItem={(itemId) => handleRemoveZoneMediaItem(slot.slotKey, itemId)}
                  />
                ))
              )}
            </div>
          )}

          {/* STEP 5: ESTILO */}
          {activeStep === 5 && (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Estilo do texto
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Fonte, cor e traçado sobre o vídeo (loop de 3s). Tema e alinhamento ficam no Perfil.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveStyleClick}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 shrink-0 cursor-pointer transition-colors"
                >
                  {styleSavedToast ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Estilo salvo</span>
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-3.5 h-3.5 text-slate-500" />
                      <span>Salvar estilo</span>
                    </>
                  )}
                </button>
              </div>

              {/* Main 2-Column Body */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left Column: Presets, Fonte da frase, Cor da frase */}
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700">
                      Estilo salvo
                    </label>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleSelectSavedStyle(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="w-full h-10 px-3 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-[#E6198E]"
                    >
                      <option value="">Escolher estilo salvo...</option>
                      {savedStyles.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700">
                      Fonte da frase
                    </label>
                    <select
                      value={`${project.style.fontFamily}|${project.style.fontWeight}`}
                      onChange={(e) => {
                        const [fontFamily, fontWeight] = e.target.value.split('|') as [
                          TemplateProject['style']['fontFamily'],
                          TemplateProject['style']['fontWeight'],
                        ];
                        updateStyle({ fontFamily, fontWeight });
                      }}
                      className="w-full h-10 px-3 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-[#E6198E]"
                    >
                      {FONT_STYLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-700">
                      Cor da frase
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {PHRASE_COLOR_SWATCHES.map((hex) => {
                        const isSelected =
                          effectivePhraseColor.toUpperCase() === hex.toUpperCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => updateStyle({ phraseColor: hex })}
                            title={hex}
                            aria-label={`Selecionar cor ${hex}`}
                            style={{ backgroundColor: hex }}
                            className={`w-8 h-8 rounded-lg border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-[#E6198E] ring-2 ring-[#E6198E] ring-offset-1'
                                : 'border-slate-200 hover:scale-105'
                            }`}
                          />
                        );
                      })}

                      <label
                        title="Escolher cor personalizada"
                        className="relative h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 flex items-center cursor-pointer transition-colors"
                      >
                        <span className="font-mono-tabular text-[11px] font-medium text-slate-700">
                          {effectivePhraseColor.toUpperCase()}
                        </span>
                        <input
                          type="color"
                          value={effectivePhraseColor}
                          onChange={(e) =>
                            updateStyle({ phraseColor: e.target.value.toUpperCase() })
                          }
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right Column: Traço (contorno) + 3 Tipografia/Espaçamento Sliders */}
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="block text-xs font-medium text-slate-800">
                          Traço (contorno)
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {project.style.strokeEnabled
                            ? 'Ligado — ajuste a cor e espessura abaixo.'
                            : 'Desligado — ligue para contornar a frase.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={project.style.strokeEnabled}
                        aria-label="Alternar traço de contorno"
                        onClick={() =>
                          updateStyle({ strokeEnabled: !project.style.strokeEnabled })
                        }
                        className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                          project.style.strokeEnabled ? 'bg-[#E6198E]' : 'bg-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-xs transition-transform ${
                            project.style.strokeEnabled ? 'translate-x-4.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {project.style.strokeEnabled && (
                      <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-700">
                            Cor do contorno
                          </span>
                          <label className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-slate-200 bg-white cursor-pointer">
                            <span
                              style={{ backgroundColor: project.style.strokeColor }}
                              className="w-4 h-4 rounded border border-slate-200"
                            />
                            <span className="font-mono-tabular text-[11px] text-slate-700">
                              {project.style.strokeColor.toUpperCase()}
                            </span>
                            <input
                              type="color"
                              value={project.style.strokeColor}
                              onChange={(e) =>
                                updateStyle({ strokeColor: e.target.value.toUpperCase() })
                              }
                              className="sr-only"
                            />
                          </label>
                        </div>

                        {renderSlider(
                          'Espessura',
                          project.style.strokeWidth,
                          1,
                          10,
                          (v) => updateStyle({ strokeWidth: v })
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                    {renderSlider(
                      'Tamanho da frase',
                      project.appearance.phraseFontSize,
                      32,
                      84,
                      (v) => updateAppearance({ phraseFontSize: v })
                    )}
                    {renderSlider(
                      'Espaçamento lateral',
                      project.appearance.horizontalPadding,
                      24,
                      150,
                      (v) => updateAppearance({ horizontalPadding: v })
                    )}
                    {renderSlider(
                      'Espaço acima do perfil',
                      project.appearance.topSpacing,
                      40,
                      240,
                      (v) => updateAppearance({ topSpacing: v })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: VARIAÇÕES */}
          {activeStep === 6 && (
            <div className="space-y-5">
              {/* Top 2-Column Row: Como combinar + Proteção dos vídeos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Left Card: Como combinar */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Link2 className="w-4 h-4 text-slate-600 shrink-0" />
                    <span className="font-display text-sm font-bold text-slate-900">
                      Como combinar
                    </span>
                    <span className="text-slate-500">
                      escolha como a mídia e as frases viram vídeos.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Option 1: Cruzar tudo */}
                    <button
                      type="button"
                      onClick={() => updateVariationsConfig({ combineMode: 'cross' })}
                      className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                        variationsConfig.combineMode === 'cross'
                          ? 'border-[#E6198E] bg-pink-50/45 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <LayoutGrid
                          className={`w-3.5 h-3.5 ${
                            variationsConfig.combineMode === 'cross'
                              ? 'text-[#E6198E]'
                              : 'text-slate-500'
                          }`}
                        />
                        <span
                          className={`text-xs font-semibold ${
                            variationsConfig.combineMode === 'cross'
                              ? 'text-[#E6198E]'
                              : 'text-slate-800'
                          }`}
                        >
                          Cruzar tudo
                        </span>
                      </div>
                      <p
                        className={`font-display text-2xl font-bold font-mono-tabular mt-2 leading-none ${
                          variationsConfig.combineMode === 'cross'
                            ? 'text-[#E6198E]'
                            : 'text-slate-900'
                        }`}
                      >
                        {variationsSummary.crossTotal}
                      </p>
                      <p className="text-xs text-slate-500 mt-1.5">
                        {variationsSummary.crossTotal === 1
                          ? 'variação será gerada'
                          : 'variações serão geradas'}
                      </p>
                    </button>

                    {/* Option 2: Sem repetir */}
                    <button
                      type="button"
                      onClick={() => updateVariationsConfig({ combineMode: 'unique' })}
                      className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                        variationsConfig.combineMode === 'unique'
                          ? 'border-[#E6198E] bg-pink-50/45 shadow-xs'
                          : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Link2
                          className={`w-3.5 h-3.5 ${
                            variationsConfig.combineMode === 'unique'
                              ? 'text-[#E6198E]'
                              : 'text-slate-500'
                          }`}
                        />
                        <span
                          className={`text-xs font-semibold ${
                            variationsConfig.combineMode === 'unique'
                              ? 'text-[#E6198E]'
                              : 'text-slate-800'
                          }`}
                        >
                          Sem repetir
                        </span>
                      </div>
                      <p
                        className={`font-display text-2xl font-bold font-mono-tabular mt-2 leading-none ${
                          variationsConfig.combineMode === 'unique'
                            ? 'text-[#E6198E]'
                            : 'text-slate-900'
                        }`}
                      >
                        {variationsSummary.uniqueTotal}
                      </p>
                      <p className="text-xs text-slate-500 mt-1.5">
                        {variationsSummary.uniqueTotal === 1
                          ? 'variação será gerada'
                          : 'variações serão geradas'}
                      </p>
                    </button>
                  </div>
                </div>

                {/* Right Card: Proteção dos vídeos */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#E6198E] shrink-0" />
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Proteção dos vídeos
                    </h2>
                  </div>

                  <div className="space-y-4 pt-0.5">
                    {/* Toggle 1: Remover metadados */}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="block text-xs font-semibold text-slate-900">
                          Remover metadados
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Apaga as informações escondidas do arquivo original.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={variationsConfig.stripMetadata}
                        aria-label="Alternar remover metadados"
                        onClick={() =>
                          updateVariationsConfig({
                            stripMetadata: !variationsConfig.stripMetadata,
                          })
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                          variationsConfig.stripMetadata ? 'bg-[#E6198E]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                            variationsConfig.stripMetadata ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Toggle 2: Anti-duplicidade */}
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="block text-xs font-semibold text-slate-900">
                          Anti-duplicidade
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Pequenas variações invisíveis para não parecer repost.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={variationsConfig.antiDuplicate}
                        aria-label="Alternar anti-duplicidade"
                        onClick={() =>
                          updateVariationsConfig({
                            antiDuplicate: !variationsConfig.antiDuplicate,
                          })
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                          variationsConfig.antiDuplicate ? 'bg-[#E6198E]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform ${
                            variationsConfig.antiDuplicate ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Full-Width Card: Variações */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-700 shrink-0" />
                    <h2 className="font-display text-sm font-bold text-slate-900">
                      Variações
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {activeVariationsCount}{' '}
                    {activeVariationsCount === 1 ? 'vídeo' : 'vídeos'}, exatamente como vão sair no render.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                  {variationsSummary.variations.map((variation) => (
                    <div
                      key={variation.id}
                      className="rounded-xl overflow-hidden border border-slate-200/90 bg-zinc-900 shadow-xs"
                    >
                      <TemplatePreviewCard
                        project={variation.projectSlice}
                        previewWidthScale={0.72}
                      />
                    </div>
                  ))}
                </div>

                {activeVariationsCount > variationsSummary.variations.length && (
                  <p className="text-[11px] text-slate-400">
                    Exibindo as primeiras {variationsSummary.variations.length} prévias de{' '}
                    {activeVariationsCount} variações totais para manter a navegação fluida.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 7: GERAR */}
          {activeStep === 7 && (
            <RenderQueueStep
              projectTitle={project.title}
              jobs={renderJobs}
              onDownloadOne={handleDownloadRenderedJob}
              onMarkPublished={handleMarkPublished}
              publishModalTarget={publishModalTarget}
              onOpenPublishModal={setPublishModalTarget}
              onClosePublishModal={() => setPublishModalTarget(null)}
            />
          )}
        </div>

        {/* Right Sticky 9:16 Live Preview Column (hidden on full-width Steps 6 & 7) */}
        {activeStep !== 6 && activeStep !== 7 && (
          <div className="w-full lg:w-[300px] xl:w-[320px] shrink-0 lg:sticky lg:top-6 flex flex-col items-center">
            <div className="w-full max-w-[300px] rounded-2xl overflow-hidden shadow-lg border border-slate-200/90 bg-zinc-900">
              <TemplatePreviewCard
                project={project}
                platformMode={platformMode}
                videoRef={previewVideoRef}
                onUploadVideoClick={() => {
                  setActiveStep(4);
                  videoInputRef.current?.click();
                }}
                onUploadZoneMedia={(slotKey, kind) => {
                  triggerZoneUpload(slotKey, kind);
                }}
              />
            </div>

            {/* Platform Safe-Zone Selector ("Ver como fica em:") */}
            <div className="mt-3 w-full max-w-[300px] flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 whitespace-nowrap">Ver como fica em:</span>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                {(
                  [
                    { id: 'clean', label: 'Limpo' },
                    { id: 'tiktok', label: 'TikTok' },
                    { id: 'reels', label: 'Reels' },
                    { id: 'shorts', label: 'Shorts' },
                  ] as { id: PlatformPreviewMode; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPlatformMode(mode.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      platformMode === mode.id
                        ? 'bg-[#E6198E] text-white font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
