import { TemplateProject, ZoneItem, ZoneMediaItem } from '../types/template';

export interface RenderedOutput {
  videoUrl: string | null;
  fallbackImageUrl: string;
  extension: 'mp4' | 'webm' | 'png';
  durationSec: number;
  width: number;
  height: number;
}

const CANVAS_W = 1080;
const CANVAS_H = 1920;

// In-session cache: blob/data/asset URL -> server mediaId
const uploadedMediaCache = new Map<string, Promise<string | null>>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function getZoneSlotAsset(
  project: TemplateProject,
  slotKey: string
): ZoneMediaItem | null {
  const list = project.media.zoneMediaItems?.[slotKey];
  if (list && list.length > 0) {
    const selectedId = project.media.selectedZoneMediaId?.[slotKey];
    return list.find((i) => i.id === selectedId) ?? list[0];
  }
  const legacy = project.media.zoneAssets?.[slotKey];
  if (legacy?.url) {
    return {
      id: `asset-${slotKey}`,
      url: legacy.url,
      name: legacy.name,
      kind: legacy.kind,
      durationSec: 10,
      trimStart: 0,
      trimEnd: 10,
      zoom: 1,
      panX: 50,
      panY: 50,
    };
  }
  return null;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCoverImageOrVideo(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  fit: 'cover' | 'contain',
  zoom = 1,
  panX = 50,
  panY = 50
) {
  const sw =
    source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh =
    source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sw || !sh) return;

  const srcAspect = sw / sh;
  const dstAspect = dw / dh;

  let drawW = dw;
  let drawH = dh;

  if (fit === 'contain') {
    if (srcAspect > dstAspect) {
      drawW = dw;
      drawH = dw / srcAspect;
    } else {
      drawH = dh;
      drawW = dh * srcAspect;
    }
  } else {
    if (srcAspect > dstAspect) {
      drawH = dh;
      drawW = dh * srcAspect;
    } else {
      drawW = dw;
      drawH = dw / srcAspect;
    }
  }

  drawW *= zoom;
  drawH *= zoom;

  const offsetX = dx - (drawW - dw) * (panX / 100);
  const offsetY = dy - (drawH - dh) * (panY / 100);

  try {
    ctx.drawImage(source, offsetX, offsetY, drawW, drawH);
  } catch {
    // Ignore cross-origin draw failures safely
  }
}

function inferExtension(url: string, name: string, kind: 'video' | 'image'): string {
  const match = (name || url).toLowerCase().match(/\.([a-z0-9]{2,5})(?:$|\?)/);
  if (match) return match[1];
  return kind === 'video' ? 'mp4' : 'png';
}

async function uploadMediaToCacheOnce(
  url: string,
  name: string,
  kind: 'video' | 'image'
): Promise<string | null> {
  if (url.startsWith('/api/media-cache/')) {
    const existingId = url.slice('/api/media-cache/'.length).split('?')[0].trim();
    if (/^[a-zA-Z0-9_-]{8,64}$/.test(existingId)) {
      return existingId;
    }
  }

  const cached = uploadedMediaCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (blob.size === 0 || blob.size > 29 * 1024 * 1024) {
        return null;
      }
      const ext = inferExtension(url, name, kind);
      const uploadResp = await fetch('/api/media-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Ext': ext,
        },
        body: blob,
      });
      if (!uploadResp.ok) return null;
      const data = (await uploadResp.json()) as { mediaId?: string };
      return data.mediaId ?? null;
    } catch {
      return null;
    }
  })();

  uploadedMediaCache.set(url, task);
  const result = await task;
  if (!result) {
    uploadedMediaCache.delete(url);
  }
  return result;
}

interface ComputedZoneRect {
  kind: 'video' | 'image';
  asset: ZoneMediaItem | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

function computeTemplateLayout(
  ctx: CanvasRenderingContext2D,
  project: TemplateProject,
  avatarImg: HTMLImageElement | null,
  viralBottomImg: HTMLImageElement | null
): {
  bgColor: string;
  zoneRects: ComputedZoneRect[];
  overlayDataUrl: string;
  snapshotDataUrl: string;
} {
  const { templateType, profile, appearance, zones, phrases, style } = project;
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
  const phraseColor = style.phraseColor ?? textColor;

  const zoneItems: ZoneItem[] =
    zones.items && zones.items.length > 0
      ? zones.items
      : [{ id: 'fallback-v1', kind: 'video', weight: 1 }];

  const activePhrase =
    phrases.variations[phrases.activeVariationIndex] ?? phrases.mainPhrase;

  const padX = Math.max(24, Math.round(appearance.horizontalPadding));
  const topPad =
    templateType === 'twitter'
      ? Math.max(18, Math.round(appearance.topSpacing * 0.55))
      : 52;
  const avatarPx = appearance.avatarSize;
  const namePx = appearance.nameFontSize;
  const handlePx = appearance.handleFontSize;
  const phrasePx = appearance.phraseFontSize;

  const zoneRects: ComputedZoneRect[] = [];

  const collectZones = (startY: number, regionH: number) => {
    const totalWeight = zoneItems.reduce((acc, z) => acc + Math.max(0.1, z.weight), 0);
    let cursorY = startY;
    for (const zone of zoneItems) {
      const zoneH = (Math.max(0.1, zone.weight) / totalWeight) * regionH;
      const insetX = zones.blurBackground && zone.kind === 'video' ? 34 : 0;
      const zx = insetX;
      const zw = CANVAS_W - insetX * 2;
      const zy = Math.round(cursorY);
      const zh = Math.round(zoneH);

      if (zone.kind === 'video') {
        zoneRects.push({
          kind: 'video',
          asset: getZoneSlotAsset(project, zone.id),
          x: zx,
          y: zy,
          w: zw,
          h: zh,
        });
      } else if (zone.kind === 'image') {
        zoneRects.push({
          kind: 'image',
          asset: getZoneSlotAsset(project, zone.id),
          x: zx,
          y: zy,
          w: zw,
          h: zh,
        });
      } else if (zone.kind === 'split_images') {
        const halfW = Math.floor((zw - 4) / 2);
        zoneRects.push({
          kind: 'image',
          asset: getZoneSlotAsset(project, `${zone.id}-left`),
          x: zx,
          y: zy,
          w: halfW,
          h: zh,
        });
        zoneRects.push({
          kind: 'image',
          asset: getZoneSlotAsset(project, `${zone.id}-right`),
          x: zx + halfW + 4,
          y: zy,
          w: halfW,
          h: zh,
        });
      }
      cursorY += zoneH;
    }
  };

  // Start with clear canvas for transparent overlay PNG
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (zones.blurBackground) {
    ctx.fillStyle =
      isLight && !style.useCustomColors
        ? 'rgba(255,255,255,0.62)'
        : 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  const drawPhraseLines = (
    text: string,
    startY: number,
    overrideColor?: string
  ): number => {
    const displayText = text || 'Sua frase aparece aqui...';
    ctx.font = `${style.fontWeight} ${phrasePx}px "${style.fontFamily}", sans-serif`;
    const maxWidth = CANVAS_W - padX * 2;
    const lines = wrapTextLines(ctx, displayText, maxWidth);
    const lineHeight = Math.round(phrasePx * 1.32);

    const align = profile.textAlign;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    const anchorX =
      align === 'center' ? CANVAS_W / 2 : align === 'right' ? CANVAS_W - padX : padX;

    let y = startY;
    for (const line of lines) {
      if (style.strokeEnabled) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(4, style.strokeWidth * 1.8);
        ctx.strokeStyle = style.strokeColor;
        ctx.strokeText(line, anchorX, y);
      }
      ctx.fillStyle = overrideColor ?? phraseColor;
      ctx.fillText(line, anchorX, y);
      y += lineHeight;
    }

    ctx.textAlign = 'left';
    return y;
  };

  const drawAvatarCircle = (cx: number, cy: number, size: number) => {
    const r = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx + r, cy + r, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImg) {
      drawCoverImageOrVideo(ctx, avatarImg, cx, cy, size, size, 'cover');
    } else {
      ctx.fillStyle = isLight ? '#E2E8F0' : '#27272A';
      ctx.fillRect(cx, cy, size, size);
      ctx.fillStyle = isLight ? '#475569' : '#D4D4D8';
      ctx.font = `600 ${Math.round(size * 0.42)}px "${style.fontFamily}", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initial = (profile.name || '?').trim().charAt(0).toUpperCase() || '?';
      ctx.fillText(initial, cx + r, cy + r);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };

  // Measure & draw template chrome + collect zone coordinates
  if (templateType === 'twitter') {
    let y = topPad;
    drawAvatarCircle(padX, y, avatarPx);

    const textStartX = padX + avatarPx + 28;
    ctx.fillStyle = textColor;
    ctx.font = `700 ${namePx}px "${style.fontFamily}", sans-serif`;
    ctx.textBaseline = 'top';
    const nameStr = profile.name || 'Seu nome';
    ctx.fillText(nameStr, textStartX, y + Math.max(8, avatarPx * 0.14));

    if (profile.verified) {
      const nameW = ctx.measureText(nameStr).width;
      const badgeR = Math.max(14, namePx * 0.36);
      const bx = textStartX + nameW + badgeR + 12;
      const by = y + Math.max(8, avatarPx * 0.14) + namePx * 0.5;
      ctx.fillStyle = '#1D9BF0';
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx - badgeR * 0.4, by);
      ctx.lineTo(bx - badgeR * 0.1, by + badgeR * 0.32);
      ctx.lineTo(bx + badgeR * 0.45, by - badgeR * 0.3);
      ctx.stroke();
    }

    ctx.fillStyle = mutedTextColor;
    ctx.font = `400 ${handlePx}px "${style.fontFamily}", sans-serif`;
    ctx.fillText(`@${profile.handle || 'seuhandle'}`, textStartX, y + avatarPx * 0.55);

    y += avatarPx + 36;
    y = drawPhraseLines(activePhrase, y);
    y += 34;

    collectZones(y, Math.max(440, CANVAS_H - y));
  } else if (templateType === 'meme') {
    let y = 36;
    if (zones.showTopBar) {
      y = drawPhraseLines(activePhrase || 'POV: Sua frase de meme aparece aqui!', 48);
      y += 36;
    }

    const bottomBarH = zones.showBottomBar ? 164 : 0;
    const zonesH = Math.max(440, CANVAS_H - y - bottomBarH);
    collectZones(y, zonesH);

    if (zones.showBottomBar) {
      const barY = y + zonesH;
      const smallAvatar = Math.max(60, Math.round(avatarPx * 0.72));
      drawAvatarCircle(CANVAS_W / 2 - 180, barY + (bottomBarH - smallAvatar) / 2, smallAvatar);
      ctx.fillStyle = textColor;
      ctx.font = `600 ${Math.max(28, namePx - 4)}px "${style.fontFamily}", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(profile.name || 'Seu Nome', CANVAS_W / 2 - 96, barY + 44);
      ctx.fillStyle = mutedTextColor;
      ctx.font = `400 ${Math.max(24, handlePx - 4)}px "${style.fontFamily}", sans-serif`;
      ctx.fillText(`@${profile.handle || 'seuhandle'}`, CANVAS_W / 2 - 96, barY + 84);
    }
  } else if (templateType === 'viral') {
    const topH = Math.round(CANVAS_H * 0.44);
    collectZones(0, topH);

    ctx.font = `${style.fontWeight} ${phrasePx}px "${style.fontFamily}", sans-serif`;
    const phraseLines = wrapTextLines(
      ctx,
      activePhrase || 'Isso aqui vai viralizar e você ainda não sabe por quê',
      CANVAS_W - padX * 2
    );
    const barH = Math.max(132, phraseLines.length * Math.round(phrasePx * 1.32) + 56);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, topH, CANVAS_W, barH);
    drawPhraseLines(
      activePhrase || 'Isso aqui vai viralizar e você ainda não sabe por quê',
      topH + 28,
      style.phraseColor ?? '#FFFFFF'
    );

    const bottomY = topH + barH;
    const bottomH = CANVAS_H - bottomY;
    ctx.fillStyle = '#18181B';
    ctx.fillRect(0, bottomY, CANVAS_W, bottomH);
    if (viralBottomImg) {
      drawCoverImageOrVideo(ctx, viralBottomImg, 0, bottomY, CANVAS_W, bottomH, 'cover');
    }
  } else {
    collectZones(0, CANVAS_H);
  }

  // Snapshot before punching transparent holes
  const snapshotDataUrl = ctx.canvas.toDataURL('image/jpeg', 0.9);

  // Punch transparent cutouts for every video/image zone (preserving rounded borders)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000';
  const radius = zones.videoBorderRadius;
  for (const zr of zoneRects) {
    if (radius > 0) {
      drawRoundedRectPath(ctx, zr.x, zr.y, zr.w, zr.h, radius);
      ctx.fill();
    } else {
      ctx.fillRect(zr.x, zr.y, zr.w, zr.h);
    }
  }
  ctx.restore();

  const overlayDataUrl = ctx.canvas.toDataURL('image/png');

  return { bgColor, zoneRects, overlayDataUrl, snapshotDataUrl };
}

export async function renderVariationToVideo(
  project: TemplateProject,
  options?: {
    variationIndex?: number;
    shouldAbort?: () => boolean;
    onProgress?: (percent: number) => void;
  }
): Promise<RenderedOutput> {
  const { variationIndex = 0, shouldAbort, onProgress } = options ?? {};

  try {
    await document.fonts.ready;
  } catch {
    // Ignore FontFaceSet error
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const [avatarImg, viralBottomImg] = await Promise.all([
    project.profile.avatarUrl ? loadImage(project.profile.avatarUrl) : Promise.resolve(null),
    project.templateType === 'viral' && project.media.secondaryImageUrl
      ? loadImage(project.media.secondaryImageUrl)
      : Promise.resolve(null),
  ]);

  if (shouldAbort?.()) {
    return {
      videoUrl: null,
      fallbackImageUrl: '',
      extension: 'png',
      durationSec: 0,
      width: CANVAS_W,
      height: CANVAS_H,
    };
  }

  onProgress?.(10);
  const { bgColor, zoneRects, overlayDataUrl, snapshotDataUrl } = computeTemplateLayout(
    ctx,
    project,
    avatarImg,
    viralBottomImg
  );

  // Determine exact trimmed duration from primary video zone
  const primaryVideoZone = zoneRects.find((z) => z.kind === 'video' && z.asset?.url);
  let durationSec = 3.0;
  if (primaryVideoZone?.asset) {
    const span =
      primaryVideoZone.asset.trimEnd > primaryVideoZone.asset.trimStart
        ? primaryVideoZone.asset.trimEnd - primaryVideoZone.asset.trimStart
        : primaryVideoZone.asset.durationSec || 5;
    durationSec = Math.min(45, Math.max(2, span / (project.media.playbackRate || 1)));
  }

  // Upload any unique source media to server cache (instant & deduplicated)
  onProgress?.(22);
  const resolvedZones = await Promise.all(
    zoneRects.map(async (zr) => {
      let mediaId: string | undefined;
      if (zr.asset?.url) {
        const uploadedId = await uploadMediaToCacheOnce(
          zr.asset.url,
          zr.asset.name,
          zr.kind
        );
        if (uploadedId) mediaId = uploadedId;
      }
      return {
        kind: zr.kind,
        mediaId,
        x: zr.x,
        y: zr.y,
        w: zr.w,
        h: zr.h,
        fit: project.zones.videoFit,
        trimStart: zr.asset?.trimStart ?? 0,
        trimEnd: zr.asset?.trimEnd ?? 0,
        zoom: zr.asset?.zoom ?? 1,
        panX: zr.asset?.panX ?? 50,
        panY: zr.asset?.panY ?? 50,
      };
    })
  );

  if (shouldAbort?.()) {
    return {
      videoUrl: null,
      fallbackImageUrl: snapshotDataUrl,
      extension: 'png',
      durationSec: 0,
      width: CANVAS_W,
      height: CANVAS_H,
    };
  }

  // Smooth progress ticker while FFmpeg encodes 1080x1920 CRF 16 MP4 on server
  let progressVal = 30;
  onProgress?.(progressVal);
  const progressTimer = window.setInterval(() => {
    progressVal = Math.min(92, progressVal + 6);
    onProgress?.(progressVal);
  }, 280);

  try {
    const resp = await fetch('/api/render-mp4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overlayBase64: overlayDataUrl,
        bgColor,
        blurBackground: project.zones.blurBackground,
        playbackRate: project.media.playbackRate || 1,
        stripMetadata: project.variationsConfig?.stripMetadata ?? true,
        antiDuplicate: project.variationsConfig?.antiDuplicate ?? true,
        variationIndex,
        durationSec,
        zones: resolvedZones,
      }),
    });

    window.clearInterval(progressTimer);

    if (resp.ok) {
      const data = (await resp.json()) as {
        url?: string;
        durationSec?: number;
        width?: number;
        height?: number;
      };
      if (data.url) {
        onProgress?.(100);
        return {
          videoUrl: data.url,
          fallbackImageUrl: snapshotDataUrl,
          extension: 'mp4',
          durationSec: data.durationSec ?? Number(durationSec.toFixed(1)),
          width: data.width ?? CANVAS_W,
          height: data.height ?? CANVAS_H,
        };
      }
    }
  } catch {
    window.clearInterval(progressTimer);
  }

  // Fallback if server FFmpeg failed or source video exceeded 30MB upload cap
  onProgress?.(100);
  return {
    videoUrl: null,
    fallbackImageUrl: snapshotDataUrl,
    extension: 'png',
    durationSec: Number(durationSec.toFixed(1)),
    width: CANVAS_W,
    height: CANVAS_H,
  };
}
