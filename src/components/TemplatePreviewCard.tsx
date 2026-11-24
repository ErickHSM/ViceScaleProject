import React from 'react';
import {
  BadgeCheck,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Music2,
  Share2,
  ThumbsUp,
  Upload,
  Video,
} from 'lucide-react';
import { PlatformPreviewMode, TemplateProject, ZoneItem } from '../types/template';

interface TemplatePreviewCardProps {
  project: TemplateProject;
  compact?: boolean;
  previewWidthScale?: number;
  platformMode?: PlatformPreviewMode;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onUploadVideoClick?: () => void;
  onUploadZoneMedia?: (slotKey: string, kind: 'video' | 'image') => void;
}

export const TemplatePreviewCard: React.FC<TemplatePreviewCardProps> = ({
  project,
  compact = false,
  previewWidthScale = 1,
  platformMode = 'clean',
  videoRef,
  onUploadVideoClick,
  onUploadZoneMedia,
}) => {
  const { templateType, profile, appearance, zones, phrases, media, style, coverImageUrl } = project;

  const isLight = profile.theme === 'light';
  const bgColor = style.useCustomColors
    ? style.customBgColor
    : templateType === 'raw'
      ? '#09090B'
      : isLight
        ? '#FFFFFF'
        : '#09090B';

  const textColor = style.useCustomColors
    ? style.customTextColor
    : templateType === 'raw'
      ? '#FFFFFF'
      : isLight
        ? '#111827'
        : '#FFFFFF';

  const mutedTextColor = isLight && !style.useCustomColors ? '#6B7280' : '#A1A1AA';

  const scale = (compact ? 0.175 : 0.275) * previewWidthScale;
  const avatarPx = Math.max(18, Math.round(appearance.avatarSize * scale));
  const namePx = Math.max(8, Math.round(appearance.nameFontSize * scale));
  const handlePx = Math.max(7, Math.round(appearance.handleFontSize * scale));
  const phrasePx = Math.max(9, Math.round(appearance.phraseFontSize * scale));
  const padX = Math.max(7, Math.round(appearance.horizontalPadding * scale));
  const topPad =
    templateType === 'twitter'
      ? Math.max(4, Math.round(appearance.topSpacing * scale * 0.55))
      : Math.round(14 * previewWidthScale);

  const activePhrase =
    phrases.variations[phrases.activeVariationIndex] ?? phrases.mainPhrase;

  const textAlignClass =
    profile.textAlign === 'center'
      ? 'text-center items-center'
      : profile.textAlign === 'right'
        ? 'text-right items-end'
        : 'text-left items-start';

  const zoneItems: ZoneItem[] =
    zones.items && zones.items.length > 0
      ? zones.items
      : [{ id: 'fallback-v1', kind: 'video', weight: 1 }];

  const firstVideoZoneId = zoneItems.find((z) => z.kind === 'video')?.id;

  const renderAvatar = (size: number) => {
    if (profile.avatarUrl) {
      return (
        <img
          src={profile.avatarUrl}
          alt={profile.name}
          referrerPolicy="no-referrer"
          style={{ width: size, height: size }}
          className="rounded-full object-cover shrink-0 border border-black/10"
        />
      );
    }
    const initials = (profile.name || '?').trim().charAt(0).toUpperCase() || '?';
    return (
      <div
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, Math.round(size * 0.42)),
        }}
        className={`rounded-full shrink-0 flex items-center justify-center font-semibold ${
          isLight ? 'bg-slate-200 text-slate-600' : 'bg-zinc-800 text-zinc-300'
        }`}
      >
        {initials}
      </div>
    );
  };

  const getSelectedZoneItem = (slotId: string) => {
    const list = media.zoneMediaItems?.[slotId];
    if (!list || list.length === 0) return null;
    const selectedId = media.selectedZoneMediaId?.[slotId];
    return list.find((item) => item.id === selectedId) ?? list[0];
  };

  const renderSingleVideoSlot = (slotId: string, isPrimaryVideo: boolean) => {
    const selectedItem = getSelectedZoneItem(slotId);
    const assetUrl =
      selectedItem?.url ??
      media.zoneAssets?.[slotId]?.url ??
      (isPrimaryVideo ? media.videoUrl : null);

    const zoom = selectedItem?.zoom ?? 1;
    const panX = selectedItem?.panX ?? 50;
    const panY = selectedItem?.panY ?? 50;
    const trimStart = selectedItem?.trimStart ?? 0;
    const trimEnd = selectedItem?.trimEnd ?? 0;

    return (
      <div
        style={{ borderRadius: `${zones.videoBorderRadius}px` }}
        className="relative w-full h-full overflow-hidden bg-[#3F3F46] flex items-center justify-center"
      >
        {assetUrl && !compact ? (
          <video
            key={assetUrl}
            ref={isPrimaryVideo ? videoRef : undefined}
            src={assetUrl}
            autoPlay
            loop
            playsInline
            muted={media.muted}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              v.playbackRate = media.playbackRate;
              if (trimStart > 0 && v.currentTime < trimStart) {
                v.currentTime = trimStart;
              }
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (trimEnd > trimStart && v.currentTime >= trimEnd) {
                v.currentTime = trimStart;
              } else if (trimStart > 0 && v.currentTime < trimStart) {
                v.currentTime = trimStart;
              }
            }}
            style={{
              objectPosition: `${panX}% ${panY}%`,
              transform: zoom > 1 ? `scale(${zoom})` : undefined,
              transformOrigin: `${panX}% ${panY}%`,
            }}
            className={`w-full h-full transition-transform duration-75 ${
              zones.videoFit === 'contain' ? 'object-contain bg-black' : 'object-cover'
            }`}
          />
        ) : compact && coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={project.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : compact ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[#3F3F46] text-zinc-300">
            <Video className="w-5 h-5 opacity-75" />
            <span className="text-[10px] font-medium opacity-75">Vídeo</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (onUploadZoneMedia) {
                onUploadZoneMedia(slotId, 'video');
              } else if (onUploadVideoClick) {
                onUploadVideoClick();
              }
            }}
            className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer px-3"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <span className="text-[11px] font-medium text-zinc-200">Vídeo</span>
            {(onUploadZoneMedia || onUploadVideoClick) && (
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Upload className="w-2.5 h-2.5" /> Subir vídeo
              </span>
            )}
          </button>
        )}
      </div>
    );
  };

  const renderSingleImageSlot = (slotId: string, fallbackUrl?: string | null) => {
    const selectedItem = getSelectedZoneItem(slotId);
    const imgUrl = selectedItem?.url ?? media.zoneAssets?.[slotId]?.url ?? fallbackUrl ?? null;
    const zoom = selectedItem?.zoom ?? 1;
    const panX = selectedItem?.panX ?? 50;
    const panY = selectedItem?.panY ?? 50;

    return (
      <div
        style={{ borderRadius: `${zones.videoBorderRadius}px` }}
        className="relative w-full h-full overflow-hidden bg-[#3F3F46] flex items-center justify-center"
      >
        {imgUrl ? (
          <img
            src={imgUrl}
            alt="Imagem da zona"
            referrerPolicy="no-referrer"
            style={{
              objectPosition: `${panX}% ${panY}%`,
              transform: zoom > 1 ? `scale(${zoom})` : undefined,
              transformOrigin: `${panX}% ${panY}%`,
            }}
            className="w-full h-full object-cover transition-transform duration-75"
          />
        ) : compact ? (
          <img
            src={coverImageUrl}
            alt={project.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-85"
          />
        ) : (
          <button
            type="button"
            onClick={() => onUploadZoneMedia?.(slotId, 'image')}
            className="w-full h-full flex flex-col items-center justify-center gap-1 text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer px-2"
          >
            <ImageIcon className="w-4 h-4 text-zinc-300" />
            <span className="text-[11px] font-medium">Imagem</span>
          </button>
        )}
      </div>
    );
  };

  const renderDynamicZonesStack = () => {
    const totalWeight = zoneItems.reduce((acc, z) => acc + Math.max(0.1, z.weight), 0);

    return (
      <div className="flex-1 min-h-0 flex flex-col w-full">
        {zoneItems.map((zone, idx) => {
          const flexGrow = Math.max(0.1, zone.weight) / totalWeight;
          const isPrimaryVideo = zone.id === firstVideoZoneId;

          return (
            <div
              key={zone.id}
              style={{
                flexGrow,
                flexBasis: 0,
                paddingLeft: zones.videoBorderRadius > 0 ? Math.round(padX * 0.35) : 0,
                paddingRight: zones.videoBorderRadius > 0 ? Math.round(padX * 0.35) : 0,
                paddingTop: idx > 0 ? 2 : 0,
              }}
              className="min-h-0 w-full flex"
            >
              {zone.kind === 'video' && (
                <div
                  className={`w-full h-full ${
                    zones.blurBackground ? 'px-4 py-1' : ''
                  }`}
                >
                  {renderSingleVideoSlot(zone.id, isPrimaryVideo)}
                </div>
              )}

              {zone.kind === 'image' && (
                <div className="w-full h-full">
                  {renderSingleImageSlot(
                    zone.id,
                    idx === 1 ? media.secondaryImageUrl : null
                  )}
                </div>
              )}

              {zone.kind === 'split_images' && (
                <div className="w-full h-full grid grid-cols-2 gap-0.5">
                  {renderSingleImageSlot(`${zone.id}-left`, media.secondaryImageUrl)}
                  {renderSingleImageSlot(`${zone.id}-right`, null)}
                </div>
              )}

              {zone.kind === 'empty' && (
                <div
                  style={{
                    backgroundColor: zones.blurBackground ? 'transparent' : bgColor,
                  }}
                  className="w-full h-full flex items-center justify-center"
                >
                  {!compact && (
                    <span className="text-[10px] opacity-35 font-medium">
                      Espaço em branco
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderPlatformSafeZones = () => {
    if (compact || platformMode === 'clean') return null;

    if (platformMode === 'tiktok') {
      return (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-black/50 via-transparent to-transparent">
          <div className="flex items-end justify-between gap-2">
            <div className="text-white space-y-1 max-w-[72%]">
              <p className="text-[11px] font-semibold">@{profile.handle || 'seuhandle'}</p>
              <p className="text-[10px] text-white/90 line-clamp-2">
                {activePhrase || 'Legenda do seu vídeo aparece nesta área segura do TikTok'}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-white/80">
                <Music2 className="w-3 h-3" />
                <span className="truncate">Som original — {profile.name || 'Criador'}</span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 text-white pb-1">
              <div className="flex flex-col items-center gap-0.5">
                <Heart className="w-5 h-5 fill-white/90" />
                <span className="text-[9px] font-mono-tabular">14.2K</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <MessageCircle className="w-5 h-5 fill-white/90" />
                <span className="text-[9px] font-mono-tabular">384</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Share2 className="w-5 h-5" />
                <span className="text-[9px] font-mono-tabular">912</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (platformMode === 'reels') {
      return (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-black/55 via-transparent to-transparent">
          <div className="flex items-end justify-between gap-2">
            <div className="text-white space-y-1 max-w-[75%]">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-white/30" />
                <span className="text-[11px] font-semibold">{profile.handle || 'seuhandle'}</span>
              </div>
              <p className="text-[10px] text-white/90 line-clamp-1">
                {activePhrase || 'Pré-visualização da área de legenda do Reels'}
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 text-white pb-1">
              <Heart className="w-5 h-5" />
              <MessageCircle className="w-5 h-5" />
              <Share2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end p-3 bg-gradient-to-t from-black/55 via-transparent to-transparent">
        <div className="flex items-end justify-between gap-2">
          <div className="text-white space-y-1 max-w-[75%]">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold">@{profile.handle || 'seuhandle'}</span>
              <span className="text-[9px] bg-white text-black font-semibold px-1.5 py-0.5 rounded">
                Inscrever-se
              </span>
            </div>
            <p className="text-[10px] text-white/90 line-clamp-2">
              {project.title || 'Título do YouTube Shorts'}
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 text-white pb-1">
            <ThumbsUp className="w-5 h-5" />
            <MessageCircle className="w-5 h-5" />
            <Share2 className="w-5 h-5" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        backgroundColor: bgColor,
        color: textColor,
        fontFamily: `'${style.fontFamily}', sans-serif`,
      }}
      className="relative w-full aspect-[9/16] overflow-hidden flex flex-col select-none"
    >
      {/* Optional Blurred Backdrop when "1 vídeo com fundo blur" preset is active */}
      {zones.blurBackground && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {media.videoUrl && !compact ? (
            <video
              src={media.videoUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover scale-125 blur-xl opacity-55"
            />
          ) : coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover scale-125 blur-xl opacity-55"
            />
          ) : null}
          <div
            className={`absolute inset-0 ${
              isLight && !style.useCustomColors ? 'bg-white/65' : 'bg-black/45'
            }`}
          />
        </div>
      )}

      {/* Foreground Template Content */}
      <div className="relative z-10 flex flex-col h-full w-full">
        {/* TEMPLATE 1: TWITTER / X */}
        {templateType === 'twitter' && (
          <>
            <div
              style={{
                paddingLeft: padX,
                paddingRight: padX,
                paddingTop: topPad,
                paddingBottom: compact ? 8 : 12,
              }}
              className="shrink-0 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2.5">
                {renderAvatar(avatarPx)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span style={{ fontSize: namePx }} className="font-bold leading-tight truncate">
                      {profile.name || 'Seu nome'}
                    </span>
                    {profile.verified && (
                      <BadgeCheck
                        style={{ width: Math.max(11, namePx), height: Math.max(11, namePx) }}
                        className="text-[#1D9BF0] fill-[#1D9BF0] stroke-white shrink-0"
                      />
                    )}
                  </div>
                  <p
                    style={{ fontSize: handlePx, color: mutedTextColor }}
                    className="leading-tight truncate"
                  >
                    @{profile.handle || 'seuhandle'}
                  </p>
                </div>
              </div>

              <div className={`flex flex-col ${textAlignClass}`}>
                <p
                  style={{
                    fontSize: phrasePx,
                    fontWeight: style.fontWeight,
                    color: style.phraseColor ?? textColor,
                    WebkitTextStroke: style.strokeEnabled
                      ? `${Math.max(1, Number((style.strokeWidth * 0.45 * previewWidthScale).toFixed(1)))}px ${style.strokeColor}`
                      : undefined,
                    paintOrder: style.strokeEnabled ? 'stroke fill' : undefined,
                  }}
                  className={`leading-snug break-words w-full ${
                    !activePhrase ? 'italic opacity-65' : ''
                  }`}
                >
                  {activePhrase || 'Sua frase aparece aqui...'}
                </p>
              </div>
            </div>

            {renderDynamicZonesStack()}
          </>
        )}

        {/* TEMPLATE 2: MEME */}
        {templateType === 'meme' && (
          <>
            {zones.showTopBar && (
              <div
                style={{
                  paddingLeft: padX,
                  paddingRight: padX,
                  paddingTop: compact ? 10 : 18,
                  paddingBottom: compact ? 8 : 14,
                }}
                className={`shrink-0 flex flex-col justify-center ${textAlignClass}`}
              >
                <p
                  style={{
                    fontSize: phrasePx,
                    fontWeight: style.fontWeight,
                    color: style.phraseColor ?? textColor,
                    WebkitTextStroke: style.strokeEnabled
                      ? `${Math.max(1, Number((style.strokeWidth * 0.45).toFixed(1)))}px ${style.strokeColor}`
                      : undefined,
                    paintOrder: style.strokeEnabled ? 'stroke fill' : undefined,
                  }}
                  className="leading-snug break-words w-full"
                >
                  {activePhrase || 'POV: Sua frase de meme aparece aqui!'}
                </p>
              </div>
            )}

            {renderDynamicZonesStack()}

            {zones.showBottomBar && (
              <div
                style={{
                  paddingLeft: padX,
                  paddingRight: padX,
                  paddingTop: compact ? 8 : 12,
                  paddingBottom: compact ? 10 : 16,
                }}
                className="shrink-0 flex items-center justify-center gap-2"
              >
                {renderAvatar(Math.max(18, Math.round(avatarPx * 0.72)))}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span style={{ fontSize: Math.max(9, namePx - 1) }} className="font-semibold truncate">
                      {profile.name || 'Seu Nome'}
                    </span>
                    {profile.verified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-[#1D9BF0] fill-[#1D9BF0] stroke-white shrink-0" />
                    )}
                  </div>
                  <p style={{ fontSize: Math.max(8, handlePx - 1), color: mutedTextColor }} className="truncate">
                    @{profile.handle || 'seuhandle'}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* TEMPLATE 3: VIDEO VIRAL */}
        {templateType === 'viral' && (
          <>
            <div className="flex-1 min-h-0 flex flex-col">
              {zoneItems.length === 1 ? (
                <>
                  <div style={{ height: `${zones.splitRatio - 6}%` }} className="min-h-0">
                    {renderSingleVideoSlot(zoneItems[0].id, true)}
                  </div>
                  <div
                    style={{ paddingLeft: padX, paddingRight: padX }}
                    className={`shrink-0 py-2.5 bg-black text-white flex flex-col justify-center ${textAlignClass}`}
                  >
                    <p
                      style={{
                        fontSize: Math.max(9, phrasePx - 1),
                        fontWeight: style.fontWeight,
                        color: style.phraseColor ?? '#FFFFFF',
                        WebkitTextStroke: style.strokeEnabled
                          ? `${Math.max(1, Number((style.strokeWidth * 0.45).toFixed(1)))}px ${style.strokeColor}`
                          : undefined,
                        paintOrder: style.strokeEnabled ? 'stroke fill' : undefined,
                      }}
                      className="leading-snug w-full"
                    >
                      {activePhrase || 'Isso aqui vai viralizar e você ainda não sabe por quê'}
                    </p>
                  </div>
                  <div className="flex-1 min-h-0">
                    {renderSingleImageSlot('viral-bottom', media.secondaryImageUrl)}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{ paddingLeft: padX, paddingRight: padX }}
                    className={`shrink-0 py-2.5 bg-black text-white flex flex-col justify-center ${textAlignClass}`}
                  >
                    <p
                      style={{
                        fontSize: Math.max(9, phrasePx - 1),
                        fontWeight: style.fontWeight,
                        color: style.phraseColor ?? '#FFFFFF',
                        WebkitTextStroke: style.strokeEnabled
                          ? `${Math.max(1, Number((style.strokeWidth * 0.45).toFixed(1)))}px ${style.strokeColor}`
                          : undefined,
                        paintOrder: style.strokeEnabled ? 'stroke fill' : undefined,
                      }}
                      className="leading-snug w-full"
                    >
                      {activePhrase || 'Isso aqui vai viralizar e você ainda não sabe por quê'}
                    </p>
                  </div>
                  {renderDynamicZonesStack()}
                </>
              )}
            </div>
          </>
        )}

        {/* TEMPLATE 4: UPLOAD SEM TEMPLATE */}
        {templateType === 'raw' && renderDynamicZonesStack()}
      </div>

      {renderPlatformSafeZones()}
    </div>
  );
};
