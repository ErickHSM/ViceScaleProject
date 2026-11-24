import 'dotenv/config';
import { execFile } from 'child_process';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(os.tmpdir(), 'scaleclip-media-cache');
const RENDER_DIR = path.join(os.tmpdir(), 'scaleclip-renders');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(RENDER_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '12mb' }));

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function runExecFile(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await runExecFile('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'csv=p=0',
      filePath,
    ]);
    return stdout.trim().includes('audio');
  } catch {
    return false;
  }
}

function findCachedMediaFile(mediaId: string): string | null {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(mediaId)) return null;
  const exts = ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'png', 'jpg', 'jpeg', 'webp'];
  for (const ext of exts) {
    const candidate = path.join(CACHE_DIR, `${mediaId}.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeHexForFfmpeg(hex: string): string {
  const clean = (hex || '#09090B').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `0x${clean}`;
  }
  return '0x09090B';
}

function extractApiErrorInfo(err: unknown): { code: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
    if (parsed?.error) {
      return {
        code: Number(parsed.error.code) || 500,
        message: parsed.error.message || raw,
      };
    }
  } catch {
    // Non-JSON error message
  }
  const statusMatch = raw.match(/\b(400|403|404|429|500|503)\b/);
  return {
    code: statusMatch ? Number(statusMatch[1]) : 500,
    message: raw,
  };
}

function isTransientDemandError(err: unknown): boolean {
  const { code, message } = extractApiErrorInfo(err);
  const lower = message.toLowerCase();
  return (
    code === 503 ||
    code === 429 ||
    code === 500 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('resource_exhausted')
  );
}

app.post(
  '/api/media-cache',
  express.raw({ type: 'application/octet-stream', limit: '30mb' }),
  (req, res) => {
    try {
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Arquivo de mídia vazio.' });
        return;
      }

      const rawExt = (req.header('x-file-ext') || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
      const allowed = new Set(['mp4', 'mov', 'webm', 'mkv', 'm4v', 'png', 'jpg', 'jpeg', 'webp']);
      const ext = allowed.has(rawExt) ? rawExt : 'mp4';

      const mediaId = crypto.randomBytes(12).toString('hex');
      const targetPath = path.join(CACHE_DIR, `${mediaId}.${ext}`);
      fs.writeFileSync(targetPath, body);

      res.json({ mediaId });
    } catch (err) {
      console.error('Erro ao armazenar mídia em cache:', err);
      res.status(500).json({ error: 'Falha ao enviar mídia para renderização.' });
    }
  }
);

app.get('/api/media-cache/:mediaId', (req, res) => {
  const { mediaId } = req.params;
  const filePath = findCachedMediaFile(mediaId);
  if (!filePath) {
    res.status(404).json({ error: 'Mídia em cache não encontrada.' });
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/mp4',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.sendFile(filePath);
});

// ---------------------------------------------------------------------------
// ViceScrap — Secure TikTok & Instagram video / profile extraction & proxy
// ---------------------------------------------------------------------------

const ALLOWED_SOCIAL_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
  'instagram.com',
  'www.instagram.com',
  'instagr.am',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

const ALLOWED_CDN_SUFFIXES = [
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.tiktokcdn-eu.com',
  '.tiktokv.com',
  '.tiktokv.us',
  '.muscdn.com',
  '.byteoversea.com',
  '.tikwm.com',
  '.cdninstagram.com',
  '.fbcdn.net',
  '.fbsbx.com',
  '.ytimg.com',
  '.googleusercontent.com',
  '.ggpht.com',
];

type ScrapedSocialPlatform = 'tiktok' | 'instagram' | 'youtube';

interface ScrapedTokenRecord {
  targetUrl: string;
  mediaKind: 'video' | 'image';
  platform: ScrapedSocialPlatform;
  suggestedFilename: string;
  durationSec: number;
  expiresAt: number;
}

const scrapeTokenStore = new Map<string, ScrapedTokenRecord>();

function cleanupExpiredScrapeTokens() {
  const now = Date.now();
  for (const [key, val] of scrapeTokenStore.entries()) {
    if (val.expiresAt <= now) {
      scrapeTokenStore.delete(key);
    }
  }
}

function isIpOrPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(':')) return true;
  return false;
}

function validateSocialInputUrl(
  raw: string
): { url: URL; platform: ScrapedSocialPlatform } | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 1000) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== '443' && parsed.port !== '80') return null;

  const host = parsed.hostname.toLowerCase();
  if (isIpOrPrivateHost(host) || !ALLOWED_SOCIAL_HOSTS.has(host)) {
    return null;
  }
  parsed.protocol = 'https:';
  const platform: ScrapedSocialPlatform =
    host.includes('instagram') || host === 'instagr.am'
      ? 'instagram'
      : host.includes('youtube') || host === 'youtu.be'
        ? 'youtube'
        : 'tiktok';
  return { url: parsed, platform };
}

function isAllowedCdnUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (isIpOrPrivateHost(host)) return false;
    return ALLOWED_CDN_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
    );
  } catch {
    return false;
  }
}

function registerScrapeToken(record: Omit<ScrapedTokenRecord, 'expiresAt'>): string | null {
  if (!isAllowedCdnUrl(record.targetUrl)) return null;
  cleanupExpiredScrapeTokens();
  const token = crypto.randomBytes(16).toString('hex');
  scrapeTokenStore.set(token, {
    ...record,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });
  return token;
}

function normalizeTikwmUrl(u?: string | null): string | null {
  if (!u || typeof u !== 'string') return null;
  const full = u.startsWith('/') ? `https://www.tikwm.com${u}` : u;
  return isAllowedCdnUrl(full) ? full : null;
}

function sanitizeFilenameBase(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return clean || 'video';
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

interface ExtractedVideoPayload {
  id: string;
  platform: ScrapedSocialPlatform;
  title: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  durationSec: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  videoStreamUrl: string | null;
  downloadUrl: string | null;
  embedUrl?: string | null;
  thumbUrl: string | null;
  sourceUrl: string;
  token: string;
  fetchedAt: string;
  createdAt?: number;
}

function buildItemWithTokens(params: {
  id: string;
  platform: ScrapedSocialPlatform;
  title: string;
  authorHandle: string;
  authorName: string;
  authorAvatarRaw?: string | null;
  durationSec: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  videoCdnUrl: string | null;
  embedUrl?: string | null;
  thumbCdnUrl?: string | null;
  sourceUrl: string;
  createdAt?: number;
}): ExtractedVideoPayload | null {
  const baseName = sanitizeFilenameBase(`${params.platform}_${params.authorHandle}_${params.id}`);
  let videoToken: string | null = null;

  if (params.videoCdnUrl) {
    videoToken = registerScrapeToken({
      targetUrl: params.videoCdnUrl,
      mediaKind: 'video',
      platform: params.platform,
      suggestedFilename: `${baseName}.mp4`,
      durationSec: params.durationSec || 5,
    });
    if (!videoToken) return null;
  } else if (!params.embedUrl) {
    return null;
  }

  let thumbUrl: string | null = null;
  if (params.thumbCdnUrl && isAllowedCdnUrl(params.thumbCdnUrl)) {
    const thumbToken = registerScrapeToken({
      targetUrl: params.thumbCdnUrl,
      mediaKind: 'image',
      platform: params.platform,
      suggestedFilename: `${baseName}_cover.jpg`,
      durationSec: 0,
    });
    if (thumbToken) thumbUrl = `/api/vicescrap/stream/${thumbToken}`;
  }

  let authorAvatarUrl: string | null = null;
  if (params.authorAvatarRaw && isAllowedCdnUrl(params.authorAvatarRaw)) {
    const avatarToken = registerScrapeToken({
      targetUrl: params.authorAvatarRaw,
      mediaKind: 'image',
      platform: params.platform,
      suggestedFilename: `${baseName}_avatar.jpg`,
      durationSec: 0,
    });
    if (avatarToken) authorAvatarUrl = `/api/vicescrap/stream/${avatarToken}`;
  }

  return {
    id: params.id,
    platform: params.platform,
    title: params.title,
    authorHandle: params.authorHandle,
    authorName: params.authorName,
    authorAvatarUrl,
    durationSec: params.durationSec,
    views: params.views,
    likes: params.likes,
    comments: params.comments,
    shares: params.shares,
    videoStreamUrl: videoToken ? `/api/vicescrap/stream/${videoToken}` : null,
    downloadUrl: videoToken ? `/api/vicescrap/stream/${videoToken}?download=1` : null,
    embedUrl: params.embedUrl ?? null,
    thumbUrl,
    sourceUrl: params.sourceUrl,
    token: videoToken || `yt_${params.id}`,
    fetchedAt: new Date().toISOString(),
    createdAt: params.createdAt,
  };
}

async function extractTikTokVideoByUrl(targetUrl: string): Promise<ExtractedVideoPayload> {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}&hd=1`;
  const resp = await fetch(apiUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!resp.ok) {
    throw new Error(`Falha ao consultar vídeo do TikTok (HTTP ${resp.status}).`);
  }

  const json = (await resp.json()) as {
    code?: number;
    msg?: string;
    data?: {
      id?: string;
      title?: string;
      duration?: number;
      play?: string;
      hdplay?: string;
      wmplay?: string;
      cover?: string;
      origin_cover?: string;
      play_count?: number;
      digg_count?: number;
      comment_count?: number;
      share_count?: number;
      author?: {
        unique_id?: string;
        nickname?: string;
        avatar?: string;
      };
    };
  };

  if (json.code !== 0 || !json.data) {
    throw new Error(
      'Não foi possível extrair esse vídeo do TikTok. Verifique se o link é público e válido.'
    );
  }

  const d = json.data;
  const videoCdn =
    normalizeTikwmUrl(d.hdplay) || normalizeTikwmUrl(d.play) || normalizeTikwmUrl(d.wmplay);
  if (!videoCdn) {
    throw new Error('O link retornou sem fluxo de vídeo MP4 disponível.');
  }

  const thumbCdn = normalizeTikwmUrl(d.origin_cover) || normalizeTikwmUrl(d.cover);
  const avatarCdn = normalizeTikwmUrl(d.author?.avatar);

  const built = buildItemWithTokens({
    id: String(d.id || Date.now()),
    platform: 'tiktok',
    title: (d.title || 'Vídeo do TikTok').trim(),
    authorHandle: d.author?.unique_id || 'tiktok',
    authorName: d.author?.nickname || d.author?.unique_id || 'Criador TikTok',
    authorAvatarRaw: avatarCdn,
    durationSec: Number(d.duration) || 5,
    views: typeof d.play_count === 'number' ? d.play_count : null,
    likes: typeof d.digg_count === 'number' ? d.digg_count : null,
    comments: typeof d.comment_count === 'number' ? d.comment_count : null,
    shares: typeof d.share_count === 'number' ? d.share_count : null,
    videoCdnUrl: videoCdn,
    thumbCdnUrl: thumbCdn,
    sourceUrl: targetUrl,
  });

  if (!built) {
    throw new Error('Fonte de vídeo não permitida para proxy.');
  }

  return built;
}

async function fetchInstagramEmbedStats(shortcode: string): Promise<{
  views: number | null;
  likes: number | null;
  comments: number | null;
  videoUrl: string | null;
} | null> {
  const decodeEscapes = (val: string) =>
    val.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');

  for (const pathKind of ['reel', 'p'] as const) {
    try {
      const resp = await fetch(`https://www.instagram.com/${pathKind}/${shortcode}/embed/captioned/`, {
        headers: { 'User-Agent': BOT_UA },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;
      const rawHtml = await resp.text();
      const unescaped = rawHtml.replace(/\\"/g, '"');
      const viewsMatch =
        unescaped.match(/"video_view_count":(\d+)/) ||
        unescaped.match(/"video_play_count":(\d+)/);
      const likesMatch =
        unescaped.match(/"edge_media_preview_like":\{"count":(\d+)/) ||
        unescaped.match(/"edge_liked_by":\{"count":(\d+)/);
      const commentsMatch = unescaped.match(/"edge_media_to_comment":\{"count":(\d+)/);
      const videoMatch = unescaped.match(/"video_url":"([^"]+)"/);
      const decodedVideo = videoMatch?.[1] ? decodeEscapes(videoMatch[1]) : null;
      const safeVideo = decodedVideo && isAllowedCdnUrl(decodedVideo) ? decodedVideo : null;

      if (viewsMatch?.[1] || likesMatch?.[1] || commentsMatch?.[1] || safeVideo) {
        return {
          views: viewsMatch?.[1] ? Number(viewsMatch[1]) : null,
          likes: likesMatch?.[1] ? Number(likesMatch[1]) : null,
          comments: commentsMatch?.[1] ? Number(commentsMatch[1]) : null,
          videoUrl: safeVideo,
        };
      }
    } catch {
      // Try next pathKind
    }
  }
  return null;
}

async function extractInstagramVideoByUrl(targetUrl: string): Promise<ExtractedVideoPayload> {
  const match = targetUrl.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match?.[1];
  if (!shortcode) {
    throw new Error(
      'Link do Instagram inválido. Cole o link de um Reel ou Post (ex.: instagram.com/reel/...).'
    );
  }

  const decodeEscapes = (val: string) =>
    val
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');

  const candidates: Array<{ url: string; ua: string }> = [
    { url: `https://www.instagram.com/reel/${shortcode}/embed/captioned/`, ua: BOT_UA },
    { url: `https://www.instagram.com/p/${shortcode}/embed/captioned/`, ua: BOT_UA },
    { url: `https://www.instagram.com/reel/${shortcode}/embed/captioned/`, ua: BROWSER_UA },
    { url: `https://www.instagram.com/p/${shortcode}/embed/captioned/`, ua: BROWSER_UA },
  ];

  for (const candidate of candidates) {
    try {
      const resp = await fetch(candidate.url, {
        headers: {
          'User-Agent': candidate.ua,
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const rawHtml = await resp.text();
      const html = rawHtml.replace(/\\"/g, '"');

      const videoMatch =
        html.match(/"video_url"\s*:\s*"([^"]+)"/) ||
        html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i);

      if (videoMatch?.[1]) {
        const videoCdn = decodeEscapes(videoMatch[1]);
        const thumbMatch =
          html.match(/"display_url"\s*:\s*"([^"]+)"/) ||
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        const ownerMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
        const captionMatch = html.match(/"text"\s*:\s*"([^"]{1,300})"/);
        const likesMatch =
          html.match(/"edge_media_preview_like"\s*:\s*\{"count"\s*:\s*(\d+)/) ||
          html.match(/"edge_liked_by"\s*:\s*\{"count"\s*:\s*(\d+)/);
        const viewsMatch =
          html.match(/"video_view_count"\s*:\s*(\d+)/) ||
          html.match(/"video_play_count"\s*:\s*(\d+)/);
        const commentsMatch = html.match(/"edge_media_to_comment"\s*:\s*\{"count"\s*:\s*(\d+)/);
        const tsMatch = html.match(/"taken_at_timestamp"\s*:\s*(\d+)/);

        const built = buildItemWithTokens({
          id: shortcode,
          platform: 'instagram',
          title: captionMatch?.[1]
            ? decodeEscapes(captionMatch[1])
            : `Reel @${ownerMatch?.[1] || 'instagram'}`,
          authorHandle: ownerMatch?.[1] || 'instagram',
          authorName: ownerMatch?.[1] || 'Instagram',
          authorAvatarRaw: null,
          durationSec: 10,
          views: viewsMatch?.[1] ? Number(viewsMatch[1]) : null,
          likes: likesMatch?.[1] ? Number(likesMatch[1]) : null,
          comments: commentsMatch?.[1] ? Number(commentsMatch[1]) : null,
          shares: null,
          videoCdnUrl: videoCdn,
          thumbCdnUrl: thumbMatch?.[1] ? decodeEscapes(thumbMatch[1]) : null,
          sourceUrl: targetUrl,
          createdAt: tsMatch?.[1] ? Number(tsMatch[1]) : undefined,
        });

        if (built) return built;
      }
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    'O Instagram limitou o acesso anônimo a este Reel/Post no momento. Verifique se a conta é pública ou tente outro link do TikTok/Instagram.'
  );
}

async function fetchTikTokVideoPageStats(videoUrl: string): Promise<{
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  duration: number | null;
  createdAt?: number;
  playUrl: string | null;
} | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(videoUrl, {
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) continue;
      const html = await resp.text();
    const match = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match?.[1]) return null;

    const data = JSON.parse(match[1]) as {
      __DEFAULT_SCOPE__?: {
        'webapp.video-detail'?: {
          itemInfo?: {
            itemStruct?: {
              createTime?: string | number;
              stats?: {
                diggCount?: number;
                commentCount?: number;
                shareCount?: number;
                playCount?: number;
              };
              statsV2?: {
                diggCount?: string | number;
                commentCount?: string | number;
                shareCount?: string | number;
                playCount?: string | number;
              };
              video?: {
                duration?: number;
                playAddr?: string;
                downloadAddr?: string;
              };
            };
          };
        };
      };
    };

    const item = data.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item) return null;

    const toNum = (v: string | number | undefined): number | null => {
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
      }
      return null;
    };

    const likes = toNum(item.statsV2?.diggCount) ?? toNum(item.stats?.diggCount);
    const comments = toNum(item.statsV2?.commentCount) ?? toNum(item.stats?.commentCount);
    const shares = toNum(item.statsV2?.shareCount) ?? toNum(item.stats?.shareCount);
    const views = toNum(item.statsV2?.playCount) ?? toNum(item.stats?.playCount);
    const duration = typeof item.video?.duration === 'number' ? item.video.duration : null;
    const createdAt = toNum(item.createTime) ?? undefined;
    const candidatePlay =
      item.video?.playAddr && isAllowedCdnUrl(item.video.playAddr)
        ? item.video.playAddr
        : item.video?.downloadAddr && isAllowedCdnUrl(item.video.downloadAddr)
          ? item.video.downloadAddr
          : null;

      return {
        likes,
        comments,
        shares,
        views,
        duration,
        createdAt,
        playUrl: candidatePlay,
      };
    } catch {
      // Retry once if transient failure
    }
  }
  return null;
}

async function searchTikTokCreators(keyword: string): Promise<
  Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }>
> {
  try {
    const resp = await fetch(
      `https://www.tikwm.com/api/user/search?keywords=${encodeURIComponent(keyword)}&count=6`,
      {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/json',
          Referer: 'https://www.tikwm.com/',
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!resp.ok) return [];
    const json = (await resp.json()) as {
      code?: number;
      data?: {
        user_list?: Array<{
          user?: {
            uniqueId?: string;
            nickname?: string;
            verified?: boolean;
          };
          stats?: {
            followerCount?: number;
          };
        }>;
      };
    };
    const list = json.data?.user_list ?? [];
    return list
      .filter((entry) => entry.user?.uniqueId)
      .map((entry) => ({
        handle: entry.user!.uniqueId!,
        nickname: entry.user!.nickname || entry.user!.uniqueId!,
        followers: typeof entry.stats?.followerCount === 'number' ? entry.stats.followerCount : null,
        verified: Boolean(entry.user!.verified),
      }))
      .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function extractTikTokProfile(
  rawInput: string,
  sortMode: 'recent' | 'views' | 'likes' | 'comments'
): Promise<{
  profile: {
    platform: 'tiktok';
    handle: string;
    nickname: string;
    avatarUrl: string | null;
    verified: boolean;
    bio: string;
    followers: number | null;
    likes: number | null;
    videoCount: number | null;
  };
  items: ExtractedVideoPayload[];
  suggestedProfiles: Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }>;
  warning?: string;
}> {
  let handle = rawInput.trim().replace(/^@+/, '');
  if (handle.includes('tiktok.com')) {
    const validated = validateSocialInputUrl(handle);
    if (!validated || validated.platform !== 'tiktok') {
      throw new Error('Link de perfil do TikTok inválido.');
    }
    const m = validated.url.pathname.match(/\/@([a-zA-Z0-9._]+)/);
    handle = m?.[1] || '';
  }

  handle = handle.split(/[/?#]/)[0].trim();
  if (!/^[a-zA-Z0-9._]{1,40}$/.test(handle)) {
    throw new Error('Informe um @usuario válido (ex.: @gtaleaks).');
  }

  const embedUrl = `https://www.tiktok.com/embed/@${encodeURIComponent(handle)}`;
  const profilePageUrl = `https://www.tiktok.com/@${encodeURIComponent(handle)}`;

  const [embedRes, pageRes] = await Promise.allSettled([
    fetch(embedUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    }),
    fetch(profilePageUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  interface EmbedUser {
    uniqueId?: string;
    nickname?: string;
    avatarThumbUrl?: string;
    verified?: boolean;
    followerCount?: number;
    heartCount?: number;
    signature?: string;
  }
  interface EmbedVideoItem {
    id?: string;
    desc?: string;
    coverUrl?: string;
    originCoverUrl?: string;
    playAddr?: string;
    playCount?: number;
    authorUniqueId?: string;
  }
  interface PageUser {
    uniqueId?: string;
    nickname?: string;
    avatarLarger?: string;
    avatarMedium?: string;
    verified?: boolean;
    signature?: string;
  }
  interface PageStats {
    followerCount?: number;
    heartCount?: number;
    videoCount?: number;
  }

  let embedUser: EmbedUser | null = null;
  let embedVideos: EmbedVideoItem[] = [];

  if (embedRes.status === 'fulfilled' && embedRes.value.ok) {
    const embedHtml = await embedRes.value.text();
    const frontityMatch = embedHtml.match(
      /<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (frontityMatch?.[1]) {
      try {
        const frontity = JSON.parse(frontityMatch[1]) as {
          source?: {
            data?: Record<
              string,
              {
                userInfo?: EmbedUser;
                videoList?: EmbedVideoItem[];
              }
            >;
          };
        };
        const sourceMap = frontity.source?.data ?? {};
        const routeKey =
          Object.keys(sourceMap).find((k) => k.startsWith('/embed/@')) ?? '';
        const routeData = routeKey ? sourceMap[routeKey] : undefined;
        if (routeData?.userInfo) embedUser = routeData.userInfo;
        if (Array.isArray(routeData?.videoList)) embedVideos = routeData.videoList;
      } catch {
        // Ignore JSON parse fallback
      }
    }
  }

  let pageUser: PageUser | null = null;
  let pageStats: PageStats | null = null;

  if (pageRes.status === 'fulfilled' && pageRes.value.ok) {
    const html = await pageRes.value.text();
    const scriptMatch = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (scriptMatch?.[1]) {
      try {
        const data = JSON.parse(scriptMatch[1]) as {
          __DEFAULT_SCOPE__?: {
            'webapp.user-detail'?: {
              userInfo?: {
                user?: PageUser;
                stats?: PageStats;
              };
            };
          };
        };
        const userInfo = data.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
        if (userInfo?.user) pageUser = userInfo.user;
        if (userInfo?.stats) pageStats = userInfo.stats;
      } catch {
        // Ignore JSON parse fallback
      }
    }
  }

  const resolvedHandle = embedUser?.uniqueId || pageUser?.uniqueId;
  if (!resolvedHandle) {
    const candidates = await searchTikTokCreators(handle);
    if (candidates.length === 0) {
      throw new Error(`Perfil @${handle} não encontrado.`);
    }
    throw new Error(
      `Perfil exato @${handle} não encontrado. Tente @${candidates[0].handle}.`
    );
  }

  const rawAvatar =
    pageUser?.avatarLarger || pageUser?.avatarMedium || embedUser?.avatarThumbUrl || null;
  let avatarProxyUrl: string | null = null;
  if (rawAvatar && isAllowedCdnUrl(rawAvatar)) {
    const token = registerScrapeToken({
      targetUrl: rawAvatar,
      mediaKind: 'image',
      platform: 'tiktok',
      suggestedFilename: `${sanitizeFilenameBase(resolvedHandle)}_avatar.jpg`,
      durationSec: 0,
    });
    if (token) avatarProxyUrl = `/api/vicescrap/stream/${token}`;
  }

  // Enrich up to 18 videos in parallel batches of 6 directly from TikTok pages for exact likes, comments, views & timestamps
  const targetVideos = embedVideos.slice(0, 18);
  const enrichedList: Array<{
    base: (typeof targetVideos)[number];
    extra: Awaited<ReturnType<typeof fetchTikTokVideoPageStats>>;
  }> = [];

  for (let i = 0; i < targetVideos.length; i += 6) {
    const batch = targetVideos.slice(i, i + 6);
    const batchResults = await Promise.all(
      batch.map(async (vid) => {
        if (!vid.id) return { base: vid, extra: null };
        const permalink = `https://www.tiktok.com/@${resolvedHandle}/video/${vid.id}`;
        const extra = await fetchTikTokVideoPageStats(permalink);
        return { base: vid, extra };
      })
    );
    enrichedList.push(...batchResults);
  }

  const extractedItems: ExtractedVideoPayload[] = [];
  for (const { base, extra } of enrichedList) {
    if (!base.id) continue;
    const candidateVideoUrl =
      extra?.playUrl ||
      (base.playAddr && isAllowedCdnUrl(base.playAddr) ? base.playAddr : null);
    if (!candidateVideoUrl) continue;

    const thumbRaw = base.originCoverUrl || base.coverUrl || null;
    const built = buildItemWithTokens({
      id: base.id,
      platform: 'tiktok',
      title: (base.desc || `Vídeo de @${resolvedHandle}`).trim(),
      authorHandle: resolvedHandle,
      authorName: pageUser?.nickname || embedUser?.nickname || resolvedHandle,
      authorAvatarRaw: rawAvatar,
      durationSec: extra?.duration || 8,
      views: extra?.views ?? (typeof base.playCount === 'number' ? base.playCount : null),
      likes: extra?.likes ?? null,
      comments: extra?.comments ?? null,
      shares: extra?.shares ?? null,
      videoCdnUrl: candidateVideoUrl,
      thumbCdnUrl: thumbRaw,
      sourceUrl: `https://www.tiktok.com/@${resolvedHandle}/video/${base.id}`,
      createdAt: extra?.createdAt,
    });
    if (built) extractedItems.push(built);
  }

  if (sortMode === 'views') {
    extractedItems.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
  } else if (sortMode === 'comments') {
    extractedItems.sort((a, b) => (b.comments ?? -1) - (a.comments ?? -1));
  } else if (sortMode === 'recent') {
    extractedItems.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else {
    extractedItems.sort(
      (a, b) => (b.likes ?? -1) - (a.likes ?? -1) || (b.views ?? -1) - (a.views ?? -1)
    );
  }

  const followers =
    pageStats?.followerCount ??
    (typeof embedUser?.followerCount === 'number' ? embedUser.followerCount : null);

  let suggestedProfiles: Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }> = [];

  if (extractedItems.length <= 2 || (followers !== null && followers < 1000)) {
    const matches = await searchTikTokCreators(handle);
    suggestedProfiles = matches.filter(
      (m) => m.handle.toLowerCase() !== resolvedHandle.toLowerCase()
    );
  }

  const warning =
    extractedItems.length === 0
      ? `O perfil @${resolvedHandle} não possui vídeos públicos disponíveis no momento.`
      : undefined;

  return {
    profile: {
      platform: 'tiktok',
      handle: resolvedHandle,
      nickname: pageUser?.nickname || embedUser?.nickname || resolvedHandle,
      avatarUrl: avatarProxyUrl,
      verified: Boolean(pageUser?.verified ?? embedUser?.verified),
      bio: pageUser?.signature || embedUser?.signature || '',
      followers,
      likes:
        pageStats?.heartCount ??
        (typeof embedUser?.heartCount === 'number' ? embedUser.heartCount : null),
      videoCount: typeof pageStats?.videoCount === 'number' ? pageStats.videoCount : null,
    },
    items: extractedItems,
    suggestedProfiles,
    warning,
  };
}

function parseCompactNumber(raw?: string | null): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\u00a0/g, ' ').trim();
  const m = s.match(/([\d.,]+)\s*(bi|b|mi|m|mil|k)?/i);
  if (!m) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit) {
    const normalized = m[1].replace(',', '.');
    const val = parseFloat(normalized);
    if (Number.isNaN(val)) return null;
    if (unit === 'bi' || unit === 'b') return Math.round(val * 1_000_000_000);
    if (unit === 'mi' || unit === 'm') return Math.round(val * 1_000_000);
    if (unit === 'mil' || unit === 'k') return Math.round(val * 1_000);
    return Math.round(val);
  }
  const digits = m[1].replace(/[.,]/g, '');
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

async function fetchYouTubeShortStats(videoId: string): Promise<{
  likes: number | null;
  comments: number | null;
  views: number | null;
  createdAt?: number;
} | null> {
  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_UA,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240726.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const raw = await resp.text();

    const likesMatch = raw.match(
      /"factoidRenderer":\{"value":\{"simpleText":"([^"]+)"\},"label":\{"simpleText":"Likes?"\}/
    );
    const viewsMatch = raw.match(
      /"factoidRenderer":\{"value":\{"simpleText":"([^"]+)"\},"label":\{"simpleText":"Views?"\}/
    );
    // Anchor strictly to the Comments engagement panel header so unrelated contextualInfo never leaks in
    const commentsMatch = raw.match(
      /"engagementPanelTitleHeaderRenderer":\{"title":\{"runs":\[\{"text":"Comments"\}\]\},"contextualInfo":\{"runs":\[\{"text":"([^"]+)"\}\]/
    );

    let createdAt: number | undefined;
    const dateTextMatch = raw.match(/"dateText":\{"simpleText":"([^"]+)"\}/);
    if (dateTextMatch?.[1]) {
      const parsedTs = Date.parse(dateTextMatch[1]);
      if (!Number.isNaN(parsedTs)) {
        createdAt = Math.floor(parsedTs / 1000);
      }
    }
    if (!createdAt) {
      const dateMatchCurrentYear = raw.match(
        /"factoidRenderer":\{"value":\{"simpleText":"([^"]+)"\},"label":\{"simpleText":"(\d{4})"\}/
      );
      const dateMatchPastYear = raw.match(
        /"factoidRenderer":\{"value":\{"simpleText":"(\d{4})"\},"label":\{"simpleText":"([^"]+)"\}/
      );
      const dateStr = dateMatchCurrentYear
        ? `${dateMatchCurrentYear[1]}, ${dateMatchCurrentYear[2]}`
        : dateMatchPastYear
          ? `${dateMatchPastYear[2]}, ${dateMatchPastYear[1]}`
          : null;
      if (dateStr) {
        const parsedTs = Date.parse(dateStr);
        if (!Number.isNaN(parsedTs)) {
          createdAt = Math.floor(parsedTs / 1000);
        }
      }
    }

    return {
      likes: likesMatch?.[1] ? parseCompactNumber(likesMatch[1]) : null,
      views: viewsMatch?.[1] ? parseCompactNumber(viewsMatch[1]) : null,
      comments: commentsMatch?.[1] ? parseCompactNumber(commentsMatch[1]) : null,
      createdAt,
    };
  } catch {
    return null;
  }
}

async function searchYouTubeChannels(keyword: string): Promise<
  Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }>
> {
  try {
    const resp = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_UA,
      },
      body: JSON.stringify({
        query: keyword,
        params: 'EgIQAg==',
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240726.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return [];
    const raw = await resp.text();
    const results: Array<{
      handle: string;
      nickname: string;
      followers: number | null;
      verified: boolean;
    }> = [];
    const seen = new Set<string>();

    const data = JSON.parse(raw) as {
      contents?: {
        twoColumnSearchResultsRenderer?: {
          primaryContents?: {
            sectionListRenderer?: {
              contents?: Array<{
                itemSectionRenderer?: {
                  contents?: Array<{
                    channelRenderer?: {
                      title?: { simpleText?: string };
                      navigationEndpoint?: {
                        browseEndpoint?: { canonicalBaseUrl?: string };
                      };
                      subscriberCountText?: { simpleText?: string };
                      ownerBadges?: Array<{
                        metadataBadgeRenderer?: { style?: string };
                      }>;
                    };
                  }>;
                };
              }>;
            };
          };
        };
      };
    };

    const sections =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents ?? [];
    for (const sec of sections) {
      for (const item of sec.itemSectionRenderer?.contents ?? []) {
        const ch = item.channelRenderer;
        const canonical = ch?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ?? '';
        const handleMatch = canonical.match(/^\/@([^/?#]+)/);
        if (!handleMatch?.[1]) continue;
        const h = decodeURIComponent(handleMatch[1]);
        if (seen.has(h.toLowerCase())) continue;
        seen.add(h.toLowerCase());
        results.push({
          handle: h,
          nickname: ch?.title?.simpleText || h,
          followers: parseCompactNumber(ch?.subscriberCountText?.simpleText),
          verified: Boolean(ch?.ownerBadges && ch.ownerBadges.length > 0),
        });
      }
    }

    return results.slice(0, 5);
  } catch {
    return [];
  }
}

async function extractYouTubeVideoByUrl(targetUrl: string): Promise<ExtractedVideoPayload> {
  const shortMatch = targetUrl.match(/\/shorts\/([A-Za-z0-9_-]{6,15})/);
  const vParamMatch = targetUrl.match(/[?&]v=([A-Za-z0-9_-]{6,15})/);
  const youtuBeMatch = targetUrl.match(/youtu\.be\/([A-Za-z0-9_-]{6,15})/);
  const videoId = shortMatch?.[1] || vParamMatch?.[1] || youtuBeMatch?.[1];
  if (!videoId) {
    throw new Error('Link do YouTube inválido. Cole um link de Short ou vídeo (youtube.com/shorts/...).');
  }

  const [oembedRes, stats] = await Promise.all([
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { signal: AbortSignal.timeout(8000) }
    ),
    fetchYouTubeShortStats(videoId),
  ]);

  if (!oembedRes.ok) {
    throw new Error('Vídeo do YouTube não encontrado ou indisponível para incorporação.');
  }

  const oembed = (await oembedRes.json()) as {
    title?: string;
    author_name?: string;
    author_url?: string;
    thumbnail_url?: string;
  };
  const handleMatch = (oembed.author_url || '').match(/\/@([^/?#]+)/);
  const authorHandle = handleMatch?.[1] || 'youtube';
  const thumbRaw = oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/frame0.jpg`;

  const built = buildItemWithTokens({
    id: videoId,
    platform: 'youtube',
    title: (oembed.title || 'YouTube Short').trim(),
    authorHandle,
    authorName: oembed.author_name || authorHandle,
    authorAvatarRaw: null,
    durationSec: 30,
    views: stats?.views ?? null,
    likes: stats?.likes ?? null,
    comments: stats?.comments ?? null,
    shares: null,
    videoCdnUrl: null,
    embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`,
    thumbCdnUrl: thumbRaw,
    sourceUrl: `https://www.youtube.com/shorts/${videoId}`,
    createdAt: stats?.createdAt,
  });

  if (!built) {
    throw new Error('Não foi possível preparar este vídeo do YouTube.');
  }

  return built;
}

async function extractYouTubeProfile(
  rawInput: string,
  sortMode: 'recent' | 'views' | 'likes' | 'comments'
): Promise<{
  profile: {
    platform: 'youtube';
    handle: string;
    nickname: string;
    avatarUrl: string | null;
    verified: boolean;
    bio: string;
    followers: number | null;
    likes: number | null;
    videoCount: number | null;
  };
  items: ExtractedVideoPayload[];
  suggestedProfiles: Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }>;
  warning?: string;
}> {
  let handle = rawInput.trim().replace(/^@+/, '');
  if (handle.includes('youtube.com') || handle.includes('youtu.be')) {
    const validated = validateSocialInputUrl(handle);
    if (!validated || validated.platform !== 'youtube') {
      throw new Error('Link de canal do YouTube inválido.');
    }
    const m = validated.url.pathname.match(/\/@([^/?#]+)/);
    handle = m?.[1] || '';
  }

  handle = handle.split(/[/?#]/)[0].trim();
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(handle)) {
    throw new Error('Informe um @canal válido do YouTube (ex.: @MrBeast).');
  }

  const shortsUrl = `https://www.youtube.com/@${encodeURIComponent(handle)}/shorts`;
  const resp = await fetch(shortsUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!resp.ok) {
    const candidates = await searchYouTubeChannels(handle);
    if (candidates.length === 0) {
      throw new Error(`Canal @${handle} não encontrado no YouTube.`);
    }
    throw new Error(
      `Canal exato @${handle} não encontrado no YouTube. Tente @${candidates[0].handle}.`
    );
  }

  const html = await resp.text();
  const dataMatch = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!dataMatch?.[1]) {
    throw new Error(`Não foi possível ler os dados do canal @${handle} no YouTube.`);
  }

  interface ShortsLockup {
    onTap?: {
      innertubeCommand?: {
        reelWatchEndpoint?: {
          videoId?: string;
          thumbnail?: { thumbnails?: Array<{ url?: string }> };
        };
      };
    };
    overlayMetadata?: {
      primaryText?: { content?: string };
      secondaryText?: { content?: string };
    };
  }

  const ytData = JSON.parse(dataMatch[1]) as {
    metadata?: {
      channelMetadataRenderer?: {
        title?: string;
        description?: string;
        avatar?: { thumbnails?: Array<{ url?: string }> };
        vanityChannelUrl?: string;
      };
    };
    header?: {
      pageHeaderRenderer?: {
        pageTitle?: string;
        content?: {
          pageHeaderViewModel?: {
            title?: {
              dynamicTextViewModel?: {
                text?: {
                  content?: string;
                  attachmentRuns?: Array<{
                    element?: {
                      type?: {
                        imageType?: {
                          image?: {
                            sources?: Array<{
                              clientResource?: { imageName?: string };
                            }>;
                          };
                        };
                      };
                    };
                  }>;
                };
              };
            };
            metadata?: {
              contentMetadataViewModel?: {
                metadataRows?: Array<{
                  metadataParts?: Array<{ text?: { content?: string } }>;
                }>;
              };
            };
          };
        };
      };
    };
    contents?: {
      twoColumnBrowseResultsRenderer?: {
        tabs?: Array<{
          tabRenderer?: {
            selected?: boolean;
            content?: {
              richGridRenderer?: {
                contents?: Array<{
                  richItemRenderer?: {
                    content?: {
                      shortsLockupViewModel?: ShortsLockup;
                    };
                  };
                }>;
              };
            };
          };
        }>;
      };
    };
  };

  const chMeta = ytData.metadata?.channelMetadataRenderer;
  const pageHeader = ytData.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
  const nickname =
    pageHeader?.title?.dynamicTextViewModel?.text?.content ||
    chMeta?.title ||
    ytData.header?.pageHeaderRenderer?.pageTitle ||
    '';

  if (!nickname) {
    const candidates = await searchYouTubeChannels(handle);
    if (candidates.length === 0) {
      throw new Error(`Canal @${handle} não encontrado no YouTube.`);
    }
    throw new Error(
      `Canal exato @${handle} não encontrado no YouTube. Tente @${candidates[0].handle}.`
    );
  }

  const metaParts = (pageHeader?.metadata?.contentMetadataViewModel?.metadataRows ?? [])
    .flatMap((r) => r.metadataParts ?? [])
    .map((p) => p.text?.content || '')
    .filter(Boolean);

  const handlePart = metaParts.find((p) => p.startsWith('@'));
  const resolvedHandle =
    (handlePart ? handlePart.replace(/^@+/, '') : null) ||
    chMeta?.vanityChannelUrl?.match(/\/@([^/?#]+)/)?.[1] ||
    handle;

  const subsText = metaParts.find((p) => /subscriber|inscrito/i.test(p));
  const videosText = metaParts.find((p) => /video|vídeo/i.test(p));
  const followers = parseCompactNumber(subsText);
  const videoCount = parseCompactNumber(videosText);

  const verified = Boolean(
    pageHeader?.title?.dynamicTextViewModel?.text?.attachmentRuns?.some((run) =>
      run.element?.type?.imageType?.image?.sources?.some(
        (s) =>
          s.clientResource?.imageName === 'CHECK_CIRCLE_FILLED' ||
          s.clientResource?.imageName === 'OFFICIAL_ARTIST_BADGE'
      )
    )
  );

  const rawAvatar = chMeta?.avatar?.thumbnails?.[0]?.url || null;
  let avatarProxyUrl: string | null = null;
  if (rawAvatar && isAllowedCdnUrl(rawAvatar)) {
    const token = registerScrapeToken({
      targetUrl: rawAvatar,
      mediaKind: 'image',
      platform: 'youtube',
      suggestedFilename: `${sanitizeFilenameBase(resolvedHandle)}_avatar.jpg`,
      durationSec: 0,
    });
    if (token) avatarProxyUrl = `/api/vicescrap/stream/${token}`;
  }

  const tabs = ytData.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const selectedTab = tabs.find((t) => t.tabRenderer?.selected);
  const gridContents = selectedTab?.tabRenderer?.content?.richGridRenderer?.contents ?? [];
  let lockups = gridContents
    .map((c) => c.richItemRenderer?.content?.shortsLockupViewModel)
    .filter((v): v is ShortsLockup => Boolean(v));

  // When sorting by trending metrics (likes / views / comments), load the channel's "Popular" Shorts tab
  if (sortMode !== 'recent') {
    const rawJsonStr = dataMatch[1];
    const popIdx = rawJsonStr.indexOf('"Popular"');
    const popTokenMatch =
      popIdx !== -1 ? rawJsonStr.slice(popIdx, popIdx + 800).match(/"token":"([^"]+)"/) : null;

    if (popTokenMatch?.[1]) {
      try {
        const popRes = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': BROWSER_UA,
          },
          body: JSON.stringify({
            continuation: popTokenMatch[1],
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20240726.00.00',
                hl: 'en',
                gl: 'US',
              },
            },
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (popRes.ok) {
          const popJson = (await popRes.json()) as {
            onResponseReceivedActions?: Array<{
              reloadContinuationItemsCommand?: {
                continuationItems?: Array<{
                  richItemRenderer?: { content?: { shortsLockupViewModel?: ShortsLockup } };
                }>;
              };
              appendContinuationItemsAction?: {
                continuationItems?: Array<{
                  richItemRenderer?: { content?: { shortsLockupViewModel?: ShortsLockup } };
                }>;
              };
            }>;
          };
          const popItems = (popJson.onResponseReceivedActions ?? []).flatMap(
            (a) =>
              a.reloadContinuationItemsCommand?.continuationItems ??
              a.appendContinuationItemsAction?.continuationItems ??
              []
          );
          const popLockups = popItems
            .map((c) => c.richItemRenderer?.content?.shortsLockupViewModel)
            .filter((v): v is ShortsLockup => Boolean(v));
          if (popLockups.length > 0) {
            lockups = popLockups;
          }
        }
      } catch {
        // Fallback to default Shorts list
      }
    }
  }

  const targetShorts = lockups.slice(0, 24);
  const enrichedList: Array<{
    lockup: ShortsLockup;
    videoId: string;
    stats: Awaited<ReturnType<typeof fetchYouTubeShortStats>>;
  }> = [];

  for (let i = 0; i < targetShorts.length; i += 6) {
    const batch = targetShorts.slice(i, i + 6);
    const batchResults = await Promise.all(
      batch.map(async (lockup) => {
        const videoId = lockup.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId || '';
        if (!videoId) return null;
        const stats = await fetchYouTubeShortStats(videoId);
        return { lockup, videoId, stats };
      })
    );
    for (const r of batchResults) {
      if (r) enrichedList.push(r);
    }
  }

  const extractedItems: ExtractedVideoPayload[] = [];
  for (const { lockup, videoId, stats } of enrichedList) {
    const thumbRaw =
      lockup.onTap?.innertubeCommand?.reelWatchEndpoint?.thumbnail?.thumbnails?.[0]?.url ||
      `https://i.ytimg.com/vi/${videoId}/frame0.jpg`;
    const listViews = parseCompactNumber(lockup.overlayMetadata?.secondaryText?.content);

    const built = buildItemWithTokens({
      id: videoId,
      platform: 'youtube',
      title: (lockup.overlayMetadata?.primaryText?.content || `Short de @${resolvedHandle}`).trim(),
      authorHandle: resolvedHandle,
      authorName: nickname,
      authorAvatarRaw: rawAvatar,
      durationSec: 30,
      views: stats?.views ?? listViews,
      likes: stats?.likes ?? null,
      comments: stats?.comments ?? null,
      shares: null,
      videoCdnUrl: null,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`,
      thumbCdnUrl: thumbRaw,
      sourceUrl: `https://www.youtube.com/shorts/${videoId}`,
      createdAt: stats?.createdAt,
    });
    if (built) extractedItems.push(built);
  }

  if (sortMode === 'views') {
    extractedItems.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
  } else if (sortMode === 'comments') {
    extractedItems.sort((a, b) => (b.comments ?? -1) - (a.comments ?? -1));
  } else if (sortMode === 'recent') {
    extractedItems.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else {
    extractedItems.sort(
      (a, b) => (b.likes ?? -1) - (a.likes ?? -1) || (b.views ?? -1) - (a.views ?? -1)
    );
  }

  let suggestedProfiles: Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }> = [];

  if (extractedItems.length <= 2) {
    const matches = await searchYouTubeChannels(handle);
    suggestedProfiles = matches.filter(
      (m) => m.handle.toLowerCase() !== resolvedHandle.toLowerCase()
    );
  }

  const warning =
    extractedItems.length === 0
      ? `O canal @${resolvedHandle} não possui YouTube Shorts públicos listados.`
      : undefined;

  return {
    profile: {
      platform: 'youtube',
      handle: resolvedHandle,
      nickname,
      avatarUrl: avatarProxyUrl,
      verified,
      bio: chMeta?.description || '',
      followers,
      likes: null,
      videoCount,
    },
    items: extractedItems,
    suggestedProfiles,
    warning,
  };
}

function decodeStoryNavUrl(encoded?: string | null): string | null {
  if (!encoded || typeof encoded !== 'string') return null;
  if (encoded.startsWith('http://') || encoded.startsWith('https://')) {
    return isAllowedCdnUrl(encoded) ? encoded : null;
  }
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8').trim();
    return isAllowedCdnUrl(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Instagram Graph API (Meta Business Discovery + OAuth Popup Flow)
// ---------------------------------------------------------------------------

interface IgGraphSession {
  accessToken: string;
  igUserId: string;
  igUsername: string;
  igName: string;
  expiresAt: number;
}

const igOAuthStateStore = new Map<string, { expiresAt: number }>();
const igGraphSessionStore = new Map<string, IgGraphSession>();
let cachedEnvIgAccount: { tokenHash: string; igUserId: string; igUsername: string; igName: string } | null = null;

function cleanupExpiredIgStores() {
  const now = Date.now();
  for (const [k, v] of igOAuthStateStore.entries()) {
    if (v.expiresAt <= now) igOAuthStateStore.delete(k);
  }
  for (const [k, v] of igGraphSessionStore.entries()) {
    if (v.expiresAt <= now) igGraphSessionStore.delete(k);
  }
}

function resolveAppBaseUrl(): string {
  const envUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)) {
    return envUrl;
  }
  return `http://localhost:${PORT}`;
}

async function discoverIgBusinessAccount(
  accessToken: string,
  preferredIgUserId?: string
): Promise<{ igUserId: string; igUsername: string; igName: string }> {
  if (preferredIgUserId && /^\d+$/.test(preferredIgUserId)) {
    const selfRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(preferredIgUserId)}?fields=id,username,name&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (selfRes.ok) {
      const selfJson = (await selfRes.json()) as { id?: string; username?: string; name?: string };
      if (selfJson.id) {
        return {
          igUserId: selfJson.id,
          igUsername: selfJson.username || '',
          igName: selfJson.name || selfJson.username || 'Instagram Business',
        };
      }
    }
  }

  const accRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(10000) }
  );
  const accJson = (await accRes.json()) as {
    data?: Array<{
      instagram_business_account?: { id?: string; username?: string; name?: string };
    }>;
    error?: { message?: string };
  };

  if (!accRes.ok || accJson.error) {
    throw new Error(
      accJson.error?.message || 'Não foi possível consultar as contas vinculadas na API Graph do Instagram.'
    );
  }

  const matched = (accJson.data ?? []).find((p) => p.instagram_business_account?.id);
  const igAcc = matched?.instagram_business_account;
  if (!igAcc?.id) {
    throw new Error(
      'Nenhuma conta Profissional (Business/Creator) do Instagram vinculada a uma Página do Facebook foi encontrada nesta conta Meta.'
    );
  }

  return {
    igUserId: igAcc.id,
    igUsername: igAcc.username || '',
    igName: igAcc.name || igAcc.username || 'Instagram Business',
  };
}

async function resolveInstagramGraphAuth(req: express.Request): Promise<{
  source: 'oauth' | 'env';
  accessToken: string;
  igUserId: string;
  igUsername: string;
  igName: string;
} | null> {
  cleanupExpiredIgStores();

  const authHeader = req.header('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+([a-f0-9]{48})$/i);
  if (bearerMatch?.[1]) {
    const session = igGraphSessionStore.get(bearerMatch[1]);
    if (session && session.expiresAt > Date.now()) {
      return {
        source: 'oauth',
        accessToken: session.accessToken,
        igUserId: session.igUserId,
        igUsername: session.igUsername,
        igName: session.igName,
      };
    }
  }

  const envToken = (process.env.META_ACCESS_TOKEN || '').trim();
  const envIgId = (process.env.META_IG_USER_ID || '').trim();
  if (!envToken) return null;

  const tokenHash = crypto.createHash('sha256').update(`${envToken}:${envIgId}`).digest('hex');
  if (cachedEnvIgAccount && cachedEnvIgAccount.tokenHash === tokenHash) {
    return {
      source: 'env',
      accessToken: envToken,
      igUserId: cachedEnvIgAccount.igUserId,
      igUsername: cachedEnvIgAccount.igUsername,
      igName: cachedEnvIgAccount.igName,
    };
  }

  try {
    const discovered = await discoverIgBusinessAccount(envToken, envIgId || undefined);
    cachedEnvIgAccount = { tokenHash, ...discovered };
    return {
      source: 'env',
      accessToken: envToken,
      ...discovered,
    };
  } catch {
    return null;
  }
}

app.get('/api/vicescrap/instagram-graph/status', async (req, res) => {
  const oauthConfigured = Boolean(
    (process.env.META_APP_ID || '').trim() && (process.env.META_APP_SECRET || '').trim()
  );
  const auth = await resolveInstagramGraphAuth(req);
  res.json({
    connected: Boolean(auth),
    source: auth?.source ?? 'none',
    oauthConfigured,
    accountUsername: auth?.igUsername || null,
    accountName: auth?.igName || null,
  });
});

app.get('/api/auth/instagram/url', (req, res) => {
  const clientId = (process.env.META_APP_ID || '').trim();
  const clientSecret = (process.env.META_APP_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    res.status(400).json({
      error:
        'Configure META_APP_ID e META_APP_SECRET nas variáveis de ambiente (Secrets) para conectar a API Graph do Instagram via OAuth.',
    });
    return;
  }

  cleanupExpiredIgStores();
  const state = crypto.randomBytes(16).toString('hex');
  igOAuthStateStore.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 });

  const redirectUri = `${resolveAppBaseUrl()}/auth/instagram/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: 'instagram_basic,pages_show_list,pages_read_engagement',
  });

  res.json({
    url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`,
    redirectUri,
  });
});

async function handleInstagramOAuthCallback(req: express.Request, res: express.Response) {
  const sendPopupResult = (payload: Record<string, unknown>, message: string) => {
    const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;"><p>${message}</p><script>if(window.opener){window.opener.postMessage(${safeJson},'*');window.close();}</script></body></html>`);
  };

  try {
    cleanupExpiredIgStores();
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const oauthErr = typeof req.query.error_description === 'string' ? req.query.error_description : '';

    if (oauthErr) {
      sendPopupResult({ type: 'IG_OAUTH_ERROR', error: oauthErr }, 'Autorização cancelada.');
      return;
    }

    const storedState = state ? igOAuthStateStore.get(state) : undefined;
    if (!code || !state || !storedState || storedState.expiresAt <= Date.now()) {
      sendPopupResult(
        { type: 'IG_OAUTH_ERROR', error: 'Sessão de autenticação inválida ou expirada.' },
        'Sessão inválida. Feche esta janela e tente novamente.'
      );
      return;
    }
    igOAuthStateStore.delete(state);

    const clientId = (process.env.META_APP_ID || '').trim();
    const clientSecret = (process.env.META_APP_SECRET || '').trim();
    const redirectUri = `${resolveAppBaseUrl()}/auth/instagram/callback`;

    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(tokenJson.error?.message || 'Falha ao obter token da Meta.');
    }

    let finalToken = tokenJson.access_token;
    try {
      const longParams = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: tokenJson.access_token,
      });
      const longRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?${longParams.toString()}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const longJson = (await longRes.json()) as { access_token?: string };
      if (longRes.ok && longJson.access_token) {
        finalToken = longJson.access_token;
      }
    } catch {
      // Keep short-lived token if long-lived exchange fails
    }

    const account = await discoverIgBusinessAccount(finalToken);
    const sessionToken = crypto.randomBytes(24).toString('hex');
    igGraphSessionStore.set(sessionToken, {
      accessToken: finalToken,
      igUserId: account.igUserId,
      igUsername: account.igUsername,
      igName: account.igName,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    sendPopupResult(
      {
        type: 'IG_OAUTH_SUCCESS',
        sessionToken,
        accountUsername: account.igUsername,
        accountName: account.igName,
      },
      'Instagram Graph API conectado! Esta janela fechará automaticamente.'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao autenticar com a API Graph do Instagram.';
    sendPopupResult({ type: 'IG_OAUTH_ERROR', error: msg }, 'Erro ao conectar. Você pode fechar esta janela.');
  }
}

app.get(['/auth/instagram/callback', '/auth/instagram/callback/'], handleInstagramOAuthCallback);

app.post('/api/auth/instagram/logout', (req, res) => {
  const authHeader = req.header('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+([a-f0-9]{48})$/i);
  if (bearerMatch?.[1]) {
    igGraphSessionStore.delete(bearerMatch[1]);
  }
  res.json({ ok: true });
});

interface GraphMediaItem {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  children?: {
    data?: Array<{
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
    }>;
  };
}

async function extractInstagramProfileGraphAPI(
  rawInput: string,
  sortMode: 'recent' | 'views' | 'likes' | 'comments',
  accessToken: string,
  igUserId: string
): Promise<{
  profile: {
    platform: 'instagram';
    handle: string;
    nickname: string;
    avatarUrl: string | null;
    verified: boolean;
    bio: string;
    followers: number | null;
    likes: number | null;
    videoCount: number | null;
  };
  items: ExtractedVideoPayload[];
  suggestedProfiles: Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }>;
  warning?: string;
  apiSource: 'instagram_graph_api';
}> {
  let handle = rawInput.trim().replace(/^@+/, '');
  if (handle.includes('instagram.com') || handle.includes('instagr.am')) {
    const validated = validateSocialInputUrl(handle);
    if (!validated || validated.platform !== 'instagram') {
      throw new Error('Link de perfil do Instagram inválido.');
    }
    const seg = validated.url.pathname.split('/').filter(Boolean)[0] || '';
    if (!seg || ['reel', 'reels', 'p', 'tv', 'stories', 'explore'].includes(seg.toLowerCase())) {
      throw new Error('Informe o link de um perfil do Instagram (ex.: instagram.com/neymarjr) ou o @usuario.');
    }
    handle = seg;
  }

  handle = handle.split(/[/?#]/)[0].trim();
  if (!/^[a-zA-Z0-9._]{1,40}$/.test(handle)) {
    throw new Error('Informe um @usuario válido do Instagram (ex.: @neymarjr).');
  }

  const mediaFields =
    'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_type,media_url,thumbnail_url}';

  const buildDiscoveryUrl = (afterCursor?: string) => {
    const mediaClause = afterCursor
      ? `media.after(${afterCursor}).limit(50){${mediaFields}}`
      : `media.limit(50){${mediaFields}}`;
    const fields = `business_discovery.username(${handle}){id,username,name,profile_picture_url,biography,followers_count,media_count,${mediaClause}}`;
    return `https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;
  };

  interface BusinessDiscoveryResponse {
    business_discovery?: {
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      biography?: string;
      followers_count?: number;
      media_count?: number;
      media?: {
        data?: GraphMediaItem[];
        paging?: {
          cursors?: { after?: string };
        };
      };
    };
    error?: { message?: string; code?: number; error_subcode?: number };
  }

  const firstRes = await fetch(buildDiscoveryUrl(), { signal: AbortSignal.timeout(12000) });
  const firstJson = (await firstRes.json()) as BusinessDiscoveryResponse;

  if (!firstRes.ok || firstJson.error || !firstJson.business_discovery) {
    const err = new Error(
      firstJson.error?.message || `Perfil @${handle} não encontrado via API Graph do Instagram.`
    ) as Error & { graphCode?: number; graphSubcode?: number };
    err.graphCode = firstJson.error?.code;
    err.graphSubcode = firstJson.error?.error_subcode;
    throw err;
  }

  const bd = firstJson.business_discovery;
  const allMedia: GraphMediaItem[] = [...(bd.media?.data ?? [])];
  let cursor = bd.media?.paging?.cursors?.after;

  // Paginate up to 2 extra pages (up to 150 recent posts) to find top viral Reels
  for (let page = 0; page < 2 && cursor; page++) {
    try {
      const nextRes = await fetch(buildDiscoveryUrl(cursor), { signal: AbortSignal.timeout(10000) });
      if (!nextRes.ok) break;
      const nextJson = (await nextRes.json()) as BusinessDiscoveryResponse;
      const nextItems = nextJson.business_discovery?.media?.data ?? [];
      if (nextItems.length === 0) break;
      allMedia.push(...nextItems);
      cursor = nextJson.business_discovery?.media?.paging?.cursors?.after;
    } catch {
      break;
    }
  }

  const resolvedHandle = bd.username || handle;
  const nickname = bd.name?.trim() || resolvedHandle;
  const rawAvatar =
    bd.profile_picture_url && isAllowedCdnUrl(bd.profile_picture_url)
      ? bd.profile_picture_url
      : null;

  let avatarProxyUrl: string | null = null;
  if (rawAvatar) {
    const token = registerScrapeToken({
      targetUrl: rawAvatar,
      mediaKind: 'image',
      platform: 'instagram',
      suggestedFilename: `${sanitizeFilenameBase(resolvedHandle)}_avatar.jpg`,
      durationSec: 0,
    });
    if (token) avatarProxyUrl = `/api/vicescrap/stream/${token}`;
  }

  const videoCandidates: Array<{
    id: string;
    shortcode: string;
    title: string;
    videoCdn: string | null;
    thumbCdn: string | null;
    likes: number | null;
    comments: number | null;
    createdAt?: number;
    permalink: string;
  }> = [];

  for (const m of allMedia) {
    if (!m.id || !m.permalink) continue;
    const isReelOrVideo =
      m.media_type === 'VIDEO' || m.media_product_type === 'REELS';
    let videoUrl = isReelOrVideo ? m.media_url : undefined;
    let thumbUrl = m.thumbnail_url || (isReelOrVideo ? undefined : m.media_url);
    let hasVideoSlide = isReelOrVideo;

    if (!videoUrl && m.media_type === 'CAROUSEL_ALBUM' && Array.isArray(m.children?.data)) {
      const vidChild = m.children.data.find((c) => c.media_type === 'VIDEO');
      if (vidChild) {
        hasVideoSlide = true;
        videoUrl = vidChild.media_url;
        thumbUrl = vidChild.thumbnail_url || thumbUrl;
      }
    }

    if (!hasVideoSlide) continue;

    const safeVideo = videoUrl && isAllowedCdnUrl(videoUrl) ? videoUrl : null;
    const scMatch = m.permalink.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    const shortcode = scMatch?.[1] || m.id;
    const parsedTs = m.timestamp ? Date.parse(m.timestamp) : NaN;

    videoCandidates.push({
      id: shortcode,
      shortcode,
      title: (m.caption || `Reel de @${resolvedHandle}`).trim(),
      videoCdn: safeVideo,
      thumbCdn: thumbUrl && isAllowedCdnUrl(thumbUrl) ? thumbUrl : null,
      likes: typeof m.like_count === 'number' ? m.like_count : null,
      comments: typeof m.comments_count === 'number' ? m.comments_count : null,
      createdAt: !Number.isNaN(parsedTs) ? Math.floor(parsedTs / 1000) : undefined,
      permalink: m.permalink,
    });
  }

  // Pre-rank by requested metric before fetching embed view counts for top 24 Reels
  const preSorted = [...videoCandidates];
  if (sortMode === 'comments') {
    preSorted.sort((a, b) => (b.comments ?? -1) - (a.comments ?? -1));
  } else if (sortMode === 'recent') {
    preSorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else {
    preSorted.sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1));
  }

  const topCandidates = preSorted.slice(0, 24);
  const embedStatsList: Array<Awaited<ReturnType<typeof fetchInstagramEmbedStats>>> = [];
  for (let i = 0; i < topCandidates.length; i += 6) {
    const batch = topCandidates.slice(i, i + 6);
    const results = await Promise.all(batch.map((c) => fetchInstagramEmbedStats(c.shortcode)));
    embedStatsList.push(...results);
  }

  const extractedItems: ExtractedVideoPayload[] = [];
  for (let i = 0; i < topCandidates.length; i++) {
    const c = topCandidates[i];
    const embedStats = embedStatsList[i];
    const finalVideoUrl = c.videoCdn || embedStats?.videoUrl || null;
    if (!finalVideoUrl) continue;

    const built = buildItemWithTokens({
      id: c.shortcode,
      platform: 'instagram',
      title: c.title,
      authorHandle: resolvedHandle,
      authorName: nickname,
      authorAvatarRaw: rawAvatar,
      durationSec: 15,
      views: embedStats?.views ?? null,
      likes: c.likes ?? embedStats?.likes ?? null,
      comments: c.comments ?? embedStats?.comments ?? null,
      shares: null,
      videoCdnUrl: finalVideoUrl,
      thumbCdnUrl: c.thumbCdn,
      sourceUrl: c.permalink,
      createdAt: c.createdAt,
    });
    if (built) extractedItems.push(built);
  }

  if (sortMode === 'views') {
    extractedItems.sort(
      (a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.likes ?? -1) - (a.likes ?? -1)
    );
  } else if (sortMode === 'comments') {
    extractedItems.sort(
      (a, b) => (b.comments ?? -1) - (a.comments ?? -1) || (b.likes ?? -1) - (a.likes ?? -1)
    );
  } else if (sortMode === 'recent') {
    extractedItems.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else {
    extractedItems.sort(
      (a, b) => (b.likes ?? -1) - (a.likes ?? -1) || (b.views ?? -1) - (a.views ?? -1)
    );
  }

  const warning =
    extractedItems.length === 0
      ? `O perfil @${resolvedHandle} não possui Reels ou vídeos públicos disponíveis nos últimos ${allMedia.length} posts retornados pela API Graph.`
      : undefined;

  return {
    profile: {
      platform: 'instagram',
      handle: resolvedHandle,
      nickname,
      avatarUrl: avatarProxyUrl,
      verified: false,
      bio: bd.biography || '',
      followers: typeof bd.followers_count === 'number' ? bd.followers_count : null,
      likes: null,
      videoCount: typeof bd.media_count === 'number' ? bd.media_count : null,
    },
    items: extractedItems,
    suggestedProfiles: [],
    warning,
    apiSource: 'instagram_graph_api',
  };
}

async function extractInstagramProfile(
  rawInput: string,
  sortMode: 'recent' | 'views' | 'likes' | 'comments'
): Promise<{
  profile: {
    platform: 'instagram';
    handle: string;
    nickname: string;
    avatarUrl: string | null;
    verified: boolean;
    bio: string;
    followers: number | null;
    likes: number | null;
    videoCount: number | null;
  };
  items: ExtractedVideoPayload[];
  suggestedProfiles: Array<{
    handle: string;
    nickname: string;
    followers: number | null;
    verified: boolean;
  }>;
  warning?: string;
}> {
  let handle = rawInput.trim().replace(/^@+/, '');
  if (handle.includes('instagram.com') || handle.includes('instagr.am')) {
    const validated = validateSocialInputUrl(handle);
    if (!validated || validated.platform !== 'instagram') {
      throw new Error('Link de perfil do Instagram inválido.');
    }
    const seg = validated.url.pathname.split('/').filter(Boolean)[0] || '';
    if (!seg || ['reel', 'reels', 'p', 'tv', 'stories', 'explore'].includes(seg.toLowerCase())) {
      throw new Error('Informe o link de um perfil do Instagram (ex.: instagram.com/neymarjr) ou o @usuario.');
    }
    handle = seg;
  }

  handle = handle.split(/[/?#]/)[0].trim();
  if (!/^[a-zA-Z0-9._]{1,40}$/.test(handle)) {
    throw new Error('Informe um @usuario válido do Instagram (ex.: @neymarjr).');
  }

  const pageUrl = `https://storynavigation.com/user/${encodeURIComponent(handle)}`;
  const pageRes = await fetch(pageUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!pageRes.ok) {
    throw new Error(`Não foi possível consultar o perfil @${handle} no Instagram no momento.`);
  }

  const html = await pageRes.text();
  const rawCookies =
    typeof (pageRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (pageRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];
  const cookieHeader = rawCookies.map((c) => c.split(';')[0]).join('; ');
  const csrf = html.match(/name="csrf-token"\s+content="([^"]+)"/i)?.[1] || '';

  const apiHeaders: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    Origin: 'https://storynavigation.com',
    Referer: pageUrl,
    ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  interface StoryNavPost {
    id?: string;
    type?: string;
    isVideo?: boolean;
    caption?: string;
    likesCount?: number;
    commentsCount?: number;
    viewsCount?: number;
    playCount?: number;
    createdTime?: string;
    thumbnailUrl?: string;
    videoUrl?: string;
    sidecarItems?: Array<{
      display_url?: string;
      is_video?: boolean;
      video_url?: string;
      videoUrl?: string;
    }>;
  }

  const profRes = await fetch('https://storynavigation.com/get-user-profile', {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ userName: handle }),
    signal: AbortSignal.timeout(15000),
  });

  if (!profRes.ok) {
    throw new Error(`Falha ao carregar o perfil @${handle} do Instagram.`);
  }

  const profJson = (await profRes.json()) as {
    found?: boolean;
    isPrivate?: boolean;
    needToLoadPosts?: boolean;
    accountInfo?: {
      id?: string | number;
      username?: string;
      fullName?: string;
      profilePicUrl?: string;
      biography?: string;
      followedByCount?: number;
      mediaCount?: number;
      isPrivate?: boolean;
      isVerified?: boolean;
    };
    posts?: StoryNavPost[];
    postsStatistics?: {
      likesCount?: number;
    };
  };

  if (!profJson.found || !profJson.accountInfo) {
    throw new Error(`Perfil @${handle} não encontrado no Instagram.`);
  }

  if (profJson.isPrivate || profJson.accountInfo.isPrivate) {
    throw new Error(`O perfil @${handle} no Instagram é privado.`);
  }

  let rawPosts: StoryNavPost[] = Array.isArray(profJson.posts) ? profJson.posts : [];
  if (rawPosts.length === 0 || profJson.needToLoadPosts) {
    try {
      const mediaRes = await fetch('https://storynavigation.com/get-user-medias', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ user_name: profJson.accountInfo.username || handle }),
        signal: AbortSignal.timeout(15000),
      });
      if (mediaRes.ok) {
        const mediaJson = (await mediaRes.json()) as StoryNavPost[] | { posts?: StoryNavPost[] };
        if (Array.isArray(mediaJson)) {
          rawPosts = mediaJson;
        } else if (Array.isArray(mediaJson?.posts)) {
          rawPosts = mediaJson.posts;
        }
      }
    } catch {
      // Keep whatever posts were already returned
    }
  }

  const resolvedHandle = profJson.accountInfo.username || handle;
  const nickname = profJson.accountInfo.fullName?.trim() || resolvedHandle;
  const rawAvatar = decodeStoryNavUrl(profJson.accountInfo.profilePicUrl);

  let avatarProxyUrl: string | null = null;
  if (rawAvatar) {
    const token = registerScrapeToken({
      targetUrl: rawAvatar,
      mediaKind: 'image',
      platform: 'instagram',
      suggestedFilename: `${sanitizeFilenameBase(resolvedHandle)}_avatar.jpg`,
      durationSec: 0,
    });
    if (token) avatarProxyUrl = `/api/vicescrap/stream/${token}`;
  }

  const candidatePosts: Array<{
    post: StoryNavPost;
    videoCdn: string;
    thumbCdn: string | null;
    isSidecarVideo: boolean;
  }> = [];

  for (const post of rawPosts) {
    if (!post.id) continue;

    let videoCdn = decodeStoryNavUrl(post.videoUrl);
    let thumbCdn = decodeStoryNavUrl(post.thumbnailUrl);
    let isSidecarVideo = false;

    if (!videoCdn && Array.isArray(post.sidecarItems)) {
      const videoSlide = post.sidecarItems.find((s) => s.is_video || s.video_url || s.videoUrl);
      if (videoSlide) {
        videoCdn = decodeStoryNavUrl(videoSlide.video_url || videoSlide.videoUrl);
        if (!thumbCdn) {
          thumbCdn = decodeStoryNavUrl(videoSlide.display_url);
        }
        isSidecarVideo = true;
      }
    }

    if (!videoCdn) continue;
    candidatePosts.push({ post, videoCdn, thumbCdn, isSidecarVideo });
  }

  // Enrich Reels/videos in parallel with real view counts via Instagram embed metadata
  const embedStatsList = await Promise.all(
    candidatePosts.map((c) => fetchInstagramEmbedStats(c.post.id!))
  );

  const extractedItems: ExtractedVideoPayload[] = [];
  for (let i = 0; i < candidatePosts.length; i++) {
    const { post, videoCdn, thumbCdn, isSidecarVideo } = candidatePosts[i];
    const embedStats = embedStatsList[i];

    const parsedDate = post.createdTime ? Date.parse(post.createdTime) : NaN;
    const createdAt = !Number.isNaN(parsedDate) ? Math.floor(parsedDate / 1000) : undefined;
    const baseViews =
      typeof post.viewsCount === 'number'
        ? post.viewsCount
        : typeof post.playCount === 'number'
          ? post.playCount
          : null;
    const views = embedStats?.views ?? baseViews;
    const likes =
      typeof post.likesCount === 'number' ? post.likesCount : (embedStats?.likes ?? null);
    const comments =
      typeof post.commentsCount === 'number'
        ? post.commentsCount
        : (embedStats?.comments ?? null);

    const built = buildItemWithTokens({
      id: post.id!,
      platform: 'instagram',
      title: (post.caption || `Reel de @${resolvedHandle}`).trim(),
      authorHandle: resolvedHandle,
      authorName: nickname,
      authorAvatarRaw: rawAvatar,
      durationSec: 15,
      views,
      likes,
      comments,
      shares: null,
      videoCdnUrl: videoCdn,
      thumbCdnUrl: thumbCdn,
      sourceUrl: isSidecarVideo
        ? `https://www.instagram.com/p/${post.id}/`
        : `https://www.instagram.com/reel/${post.id}/`,
      createdAt,
    });

    if (built) extractedItems.push(built);
  }

  if (sortMode === 'views') {
    extractedItems.sort(
      (a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.likes ?? -1) - (a.likes ?? -1)
    );
  } else if (sortMode === 'comments') {
    extractedItems.sort(
      (a, b) => (b.comments ?? -1) - (a.comments ?? -1) || (b.likes ?? -1) - (a.likes ?? -1)
    );
  } else if (sortMode === 'recent') {
    extractedItems.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } else {
    extractedItems.sort(
      (a, b) => (b.likes ?? -1) - (a.likes ?? -1) || (b.views ?? -1) - (a.views ?? -1)
    );
  }

  const warning =
    extractedItems.length === 0
      ? `O perfil @${resolvedHandle} não possui Reels ou vídeos públicos recentes disponíveis.`
      : undefined;

  return {
    profile: {
      platform: 'instagram',
      handle: resolvedHandle,
      nickname,
      avatarUrl: avatarProxyUrl,
      verified: Boolean(profJson.accountInfo.isVerified),
      bio: profJson.accountInfo.biography || '',
      followers:
        typeof profJson.accountInfo.followedByCount === 'number'
          ? profJson.accountInfo.followedByCount
          : null,
      likes:
        typeof profJson.postsStatistics?.likesCount === 'number'
          ? profJson.postsStatistics.likesCount
          : null,
      videoCount:
        typeof profJson.accountInfo.mediaCount === 'number'
          ? profJson.accountInfo.mediaCount
          : null,
    },
    items: extractedItems,
    suggestedProfiles: [],
    warning,
  };
}

app.post('/api/vicescrap/extract', async (req, res) => {
  try {
    const body = req.body as {
      mode?: 'link' | 'profile';
      query?: string;
      platform?: ScrapedSocialPlatform;
      sort?: 'recent' | 'views' | 'likes' | 'comments';
    };

    const mode = body.mode === 'profile' ? 'profile' : 'link';
    const query = (body.query ?? '').trim();

    if (!query) {
      res.status(400).json({ error: 'Cole um link ou @perfil antes de buscar.' });
      return;
    }

    if (mode === 'link') {
      const validated = validateSocialInputUrl(query);
      if (!validated) {
        res.status(400).json({
          error:
            'URL inválida. Use um link público do Instagram (instagram.com/reel/...), TikTok (tiktok.com/@.../video/...) ou YouTube Shorts (youtube.com/shorts/...).',
        });
        return;
      }

      const item =
        validated.platform === 'tiktok'
          ? await extractTikTokVideoByUrl(validated.url.toString())
          : validated.platform === 'youtube'
            ? await extractYouTubeVideoByUrl(validated.url.toString())
            : await extractInstagramVideoByUrl(validated.url.toString());

      res.json({ kind: 'video', item });
      return;
    }

    // Profile mode
    const lowerQ = query.toLowerCase();
    const platformHint: ScrapedSocialPlatform = lowerQ.includes('instagram.com')
      ? 'instagram'
      : lowerQ.includes('youtube.com') || lowerQ.includes('youtu.be')
        ? 'youtube'
        : lowerQ.includes('tiktok.com')
          ? 'tiktok'
          : body.platform === 'instagram' || body.platform === 'youtube'
            ? body.platform
            : 'tiktok';

    const sortMode =
      body.sort === 'views' ||
      body.sort === 'likes' ||
      body.sort === 'comments' ||
      body.sort === 'recent'
        ? body.sort
        : 'likes';

    if (platformHint === 'instagram') {
      const graphAuth = await resolveInstagramGraphAuth(req);
      if (graphAuth) {
        try {
          const graphResult = await extractInstagramProfileGraphAPI(
            query,
            sortMode,
            graphAuth.accessToken,
            graphAuth.igUserId
          );
          res.json({ kind: 'profile', ...graphResult });
          return;
        } catch (graphErr) {
          const errWithCode = graphErr as Error & { graphCode?: number };
          const fallbackResult = await extractInstagramProfile(query, sortMode);
          const graphHint =
            errWithCode.graphCode === 190
              ? 'Token da API Graph do Instagram expirou; resultados exibidos via fallback público.'
              : 'Conta pessoal ou indisponível via Business Discovery; resultados exibidos via fallback público.';
          res.json({
            kind: 'profile',
            ...fallbackResult,
            warning: fallbackResult.warning || graphHint,
          });
          return;
        }
      }

      const igResult = await extractInstagramProfile(query, sortMode);
      res.json({ kind: 'profile', ...igResult });
      return;
    }

    if (platformHint === 'youtube') {
      const ytResult = await extractYouTubeProfile(query, sortMode);
      res.json({ kind: 'profile', ...ytResult });
      return;
    }

    const profileResult = await extractTikTokProfile(query, sortMode);
    res.json({ kind: 'profile', ...profileResult });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Não foi possível extrair a mídia solicitada.';
    res.status(422).json({ error: message });
  }
});

app.get('/api/vicescrap/stream/:token', async (req, res) => {
  const { token } = req.params;
  if (!/^[a-f0-9]{32}$/.test(token)) {
    res.status(400).json({ error: 'Token de mídia inválido.' });
    return;
  }

  const record = scrapeTokenStore.get(token);
  if (!record || record.expiresAt <= Date.now()) {
    res.status(404).json({ error: 'Link temporário expirado. Faça uma nova busca.' });
    return;
  }

  if (!isAllowedCdnUrl(record.targetUrl)) {
    res.status(403).json({ error: 'Origem de mídia não autorizada.' });
    return;
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': BROWSER_UA,
      Referer:
        record.platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.instagram.com/',
    };
    const isProtectedDownload =
      req.query.download === '1' &&
      req.query.protected === '1' &&
      record.mediaKind === 'video';

    if (!isProtectedDownload && req.headers.range && typeof req.headers.range === 'string') {
      headers.Range = req.headers.range;
    }

    const upstream = await fetch(record.targetUrl, {
      headers,
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(502).json({ error: 'Não foi possível carregar o arquivo da rede social.' });
      return;
    }

    const contentType =
      upstream.headers.get('content-type') ||
      (record.mediaKind === 'video' ? 'video/mp4' : 'image/jpeg');
    const contentLength = upstream.headers.get('content-length');
    if (contentLength && Number(contentLength) > 50 * 1024 * 1024) {
      res.status(413).json({ error: 'O arquivo excede o limite de 50MB permitido.' });
      return;
    }

    let outBuffer: Buffer = Buffer.from(await upstream.arrayBuffer());
    if (outBuffer.length > 50 * 1024 * 1024) {
      res.status(413).json({ error: 'O arquivo excede o limite de 50MB permitido.' });
      return;
    }

    if (isProtectedDownload) {
      const tempId = crypto.randomBytes(8).toString('hex');
      const rawPath = path.join(CACHE_DIR, `prot-in-${tempId}.mp4`);
      const cleanPath = path.join(CACHE_DIR, `prot-out-${tempId}.mp4`);
      try {
        fs.writeFileSync(rawPath, outBuffer);
        await runExecFile('ffmpeg', [
          '-y',
          '-i',
          rawPath,
          '-map_metadata',
          '-1',
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '17',
          '-c:a',
          'copy',
          '-movflags',
          '+faststart',
          cleanPath,
        ]);
        outBuffer = fs.readFileSync(cleanPath);
      } catch {
        // Fallback to raw buffer if FFmpeg protection fails on unusual codec
      } finally {
        try {
          if (fs.existsSync(rawPath)) fs.unlinkSync(rawPath);
          if (fs.existsSync(cleanPath)) fs.unlinkSync(cleanPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      res.status(200);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(outBuffer.length));
    } else {
      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    }

    if (req.query.download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${sanitizeFilenameBase(record.suggestedFilename.replace(/\.(mp4|jpg)$/i, ''))}.${record.mediaKind === 'video' ? 'mp4' : 'jpg'}"`
      );
    }

    res.send(outBuffer);
  } catch {
    res.status(502).json({ error: 'Erro ao transferir o arquivo de vídeo.' });
  }
});

app.post('/api/vicescrap/to-cache/:token', async (req, res) => {
  const { token } = req.params;
  if (!/^[a-f0-9]{32}$/.test(token)) {
    res.status(400).json({ error: 'Token inválido.' });
    return;
  }

  const record = scrapeTokenStore.get(token);
  if (!record || record.expiresAt <= Date.now() || record.mediaKind !== 'video') {
    res.status(404).json({ error: 'Vídeo expirado. Busque o link novamente.' });
    return;
  }

  if (!isAllowedCdnUrl(record.targetUrl)) {
    res.status(403).json({ error: 'Origem de vídeo não autorizada.' });
    return;
  }

  try {
    const upstream = await fetch(record.targetUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Referer:
          record.platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.instagram.com/',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: 'Falha ao baixar vídeo para o estúdio.' });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length === 0 || buf.length > 29 * 1024 * 1024) {
      res.status(413).json({ error: 'O vídeo excede o limite de 29MB do estúdio.' });
      return;
    }

    const mediaId = crypto.randomBytes(12).toString('hex');
    const targetPath = path.join(CACHE_DIR, `${mediaId}.mp4`);
    fs.writeFileSync(targetPath, buf);

    res.json({
      mediaId,
      cacheUrl: `/api/media-cache/${mediaId}`,
      name: record.suggestedFilename,
      durationSec: record.durationSec || 5,
    });
  } catch {
    res.status(502).json({ error: 'Erro ao importar vídeo para o estúdio.' });
  }
});

app.get('/api/rendered/:fileName', (req, res) => {
  const { fileName } = req.params;
  if (!/^[a-zA-Z0-9_-]+\.mp4$/.test(fileName)) {
    res.status(400).json({ error: 'Nome de arquivo inválido.' });
    return;
  }
  const filePath = path.join(RENDER_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Vídeo renderizado não encontrado.' });
    return;
  }
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(filePath);
});

interface RenderZoneInput {
  kind: 'video' | 'image';
  mediaId?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fit: 'cover' | 'contain';
  trimStart: number;
  trimEnd: number;
  zoom: number;
  panX: number;
  panY: number;
}

app.post('/api/render-mp4', async (req, res) => {
  const jobId = crypto.randomBytes(10).toString('hex');
  const overlayPath = path.join(RENDER_DIR, `overlay-${jobId}.png`);
  const outputFileName = `scaleclip-${jobId}.mp4`;
  const outputPath = path.join(RENDER_DIR, outputFileName);

  try {
    const body = req.body as {
      overlayBase64?: string;
      bgColor?: string;
      blurBackground?: boolean;
      playbackRate?: number;
      stripMetadata?: boolean;
      antiDuplicate?: boolean;
      variationIndex?: number;
      durationSec?: number;
      zones?: RenderZoneInput[];
    };

    const rawOverlay = body.overlayBase64 ?? '';
    const base64Data = rawOverlay.replace(/^data:image\/png;base64,/, '');
    if (!base64Data) {
      res.status(400).json({ error: 'Overlay PNG ausente.' });
      return;
    }
    fs.writeFileSync(overlayPath, Buffer.from(base64Data, 'base64'));

    const targetDuration = Math.min(45, Math.max(2, Number(body.durationSec) || 3));
    const playbackRate = Math.min(2, Math.max(0.5, Number(body.playbackRate) || 1));
    const blurBackground = Boolean(body.blurBackground);
    const stripMetadata = body.stripMetadata !== false;
    const antiDuplicate = body.antiDuplicate !== false;
    const variationIndex = Math.max(0, Number(body.variationIndex) || 0);
    const bgHex = normalizeHexForFfmpeg(body.bgColor || '#09090B');
    const zones = Array.isArray(body.zones) ? body.zones : [];

    // Input 0: solid base canvas, Input 1: overlay PNG
    const ffmpegArgs: string[] = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${bgHex}:s=1080x1920:r=30:d=${targetDuration}`,
      '-loop',
      '1',
      '-t',
      String(targetDuration),
      '-i',
      overlayPath,
    ];

    // Map each zone's cached media file as input 2..N
    const zoneInputIdx: (number | null)[] = [];
    let nextInputIdx = 2;
    let primaryVideoInputIdx: number | null = null;
    let primaryVideoPath: string | null = null;

    for (const z of zones) {
      const filePath = z.mediaId ? findCachedMediaFile(z.mediaId) : null;
      if (!filePath) {
        zoneInputIdx.push(null);
        continue;
      }

      if (z.kind === 'video') {
        const trimStart = Math.max(0, Number(z.trimStart) || 0);
        const sourceReadDur = targetDuration * playbackRate + 0.5;
        ffmpegArgs.push(
          '-ss',
          trimStart.toFixed(3),
          '-t',
          sourceReadDur.toFixed(3),
          '-i',
          filePath
        );
        if (primaryVideoInputIdx === null) {
          primaryVideoInputIdx = nextInputIdx;
          primaryVideoPath = filePath;
        }
      } else {
        ffmpegArgs.push('-loop', '1', '-t', String(targetDuration), '-i', filePath);
      }

      zoneInputIdx.push(nextInputIdx);
      nextInputIdx += 1;
    }

    const filterParts: string[] = ['[0:v]format=rgba[bg0]'];
    let lastBgLabel = 'bg0';
    let bgCounter = 1;

    // Optional blurred full-screen backdrop when blurBackground is enabled
    let primarySplitConsumed = false;
    if (blurBackground && primaryVideoInputIdx !== null) {
      const blurSrcLabel = `vmain_${primaryVideoInputIdx}`;
      filterParts.push(
        `[${primaryVideoInputIdx}:v]split=2[vblur_raw][${blurSrcLabel}]`,
        `[vblur_raw]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=6:1,scale=1080:1920:flags=bilinear,setsar=1[vblur]`,
        `[${lastBgLabel}][vblur]overlay=0:0:shortest=1[bg${bgCounter}]`
      );
      lastBgLabel = `bg${bgCounter}`;
      bgCounter += 1;
      primarySplitConsumed = true;
    }

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const inputIdx = zoneInputIdx[i];
      const zx = Math.max(0, Math.min(1078, Math.round(z.x)));
      const zy = Math.max(0, Math.min(1918, Math.round(z.y)));
      const zw = Math.max(2, Math.min(1080 - zx, Math.round(z.w / 2) * 2));
      const zh = Math.max(2, Math.min(1920 - zy, Math.round(z.h / 2) * 2));
      const zoneOut = `z_${i}`;

      if (inputIdx === null) {
        filterParts.push(
          `color=c=0x3F3F46:s=${zw}x${zh}:r=30:d=${targetDuration}[${zoneOut}]`
        );
      } else {
        const srcLabel =
          primarySplitConsumed && inputIdx === primaryVideoInputIdx
            ? `vmain_${primaryVideoInputIdx}`
            : `${inputIdx}:v`;
        if (primarySplitConsumed && inputIdx === primaryVideoInputIdx) {
          primarySplitConsumed = false;
        }

        const speedFilter =
          z.kind === 'video' && playbackRate !== 1
            ? `setpts=PTS/${playbackRate},`
            : '';

        if (z.fit === 'contain') {
          filterParts.push(
            `[${srcLabel}]${speedFilter}scale=${zw}:${zh}:force_original_aspect_ratio=decrease,pad=${zw}:${zh}:(ow-iw)/2:(oh-ih)/2:color=0x09090B,setsar=1,tpad=stop_mode=clone:stop_duration=${targetDuration}[${zoneOut}]`
          );
        } else {
          const antiDupBump = antiDuplicate ? 1 + (variationIndex % 5) * 0.0025 : 1;
          const zoom = Math.max(1, Number(z.zoom) || 1) * antiDupBump;
          const scaledW = Math.round(zw * zoom);
          const scaledH = Math.round(zh * zoom);
          const px = (Math.max(0, Math.min(100, Number(z.panX) ?? 50)) / 100).toFixed(4);
          const py = (Math.max(0, Math.min(100, Number(z.panY) ?? 50)) / 100).toFixed(4);

          filterParts.push(
            `[${srcLabel}]${speedFilter}scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${zw}:${zh}:(iw-${zw})*${px}:(ih-${zh})*${py},setsar=1,tpad=stop_mode=clone:stop_duration=${targetDuration}[${zoneOut}]`
          );
        }
      }

      const nextBg = `bg${bgCounter}`;
      bgCounter += 1;
      filterParts.push(
        `[${lastBgLabel}][${zoneOut}]overlay=${zx}:${zy}:shortest=1[${nextBg}]`
      );
      lastBgLabel = nextBg;
    }

    // Overlay crisp 1080x1920 template PNG on top
    filterParts.push(
      `[${lastBgLabel}][1:v]overlay=0:0:shortest=1,format=yuv420p[vout]`
    );

    const includeAudio = primaryVideoPath ? await hasAudioStream(primaryVideoPath) : false;
    if (includeAudio && primaryVideoInputIdx !== null && playbackRate !== 1) {
      filterParts.push(`[${primaryVideoInputIdx}:a]atempo=${playbackRate}[aout]`);
    }

    ffmpegArgs.push('-filter_complex', filterParts.join(';'));
    ffmpegArgs.push('-map', '[vout]');

    if (includeAudio && primaryVideoInputIdx !== null) {
      ffmpegArgs.push('-map', playbackRate !== 1 ? '[aout]' : `${primaryVideoInputIdx}:a`);
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    }

    const crfValue = antiDuplicate ? 16 + (variationIndex % 2) : 16;
    ffmpegArgs.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      String(crfValue),
      '-profile:v',
      'high',
      '-level',
      '4.2',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-t',
      String(targetDuration),
      '-movflags',
      '+faststart'
    );

    if (stripMetadata) {
      ffmpegArgs.push('-map_metadata', '-1');
    }

    ffmpegArgs.push(outputPath);

    await runExecFile('ffmpeg', ffmpegArgs);

    try {
      fs.unlinkSync(overlayPath);
    } catch {
      // Ignore cleanup error
    }

    res.json({
      url: `/api/rendered/${outputFileName}`,
      durationSec: Number(targetDuration.toFixed(1)),
      width: 1080,
      height: 1920,
    });
  } catch (err) {
    console.error('Erro ao renderizar MP4 via ffmpeg:', err);
    try {
      if (fs.existsSync(overlayPath)) fs.unlinkSync(overlayPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      // Ignore cleanup error
    }
    res.status(500).json({ error: 'Falha ao renderizar vídeo MP4 no servidor.' });
  }
});

app.post('/api/generate-phrases', async (req, res) => {
  try {
    const { idea, count, templateType } = req.body as {
      idea?: string;
      count?: number;
      templateType?: string;
    };

    const trimmedIdea = (idea ?? '').trim();
    if (!trimmedIdea) {
      res.status(400).json({ error: 'Descreva a ideia do vídeo antes de gerar.' });
      return;
    }

    const safeCount = Math.min(15, Math.max(1, Number(count) || 5));
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Chave da API Gemini não configurada. Adicione GEMINI_API_KEY em Settings > Secrets para gerar frases automaticamente.',
      });
      return;
    }

    const styleHint =
      templateType === 'meme'
        ? 'Formato meme POV curto e direto.'
        : templateType === 'viral'
          ? 'Gancho de curiosidade curto para vídeo dividido.'
          : 'Estilo post/tweet curto e natural (máximo 180 caracteres cada).';

    const promptContents = `Ideia do vídeo: "${trimmedIdea}".\nGere exatamente ${safeCount} frases curtas em português do Brasil para usar como legenda no topo desse vídeo. ${styleHint}`;
    const systemInstruction =
      'Você cria ganchos curtos para vídeos verticais (TikTok, Reels, Shorts) em português do Brasil. Seja fiel exatamente ao que o usuário descreveu, sem inventar fatos ou histórias que não estão na descrição. Retorne apenas frases naturais, diretas e com até 280 caracteres.';

    const attempts: { model: string; thinkingLevel: ThinkingLevel; delayMs: number }[] = [
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayMs: 0 },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayMs: 700 },
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 900 },
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 1600 },
    ];

    let responseText = '';
    let lastError: unknown = null;

    for (const attempt of attempts) {
      if (attempt.delayMs > 0) {
        await sleep(attempt.delayMs);
      }
      try {
        const response = await ai.models.generateContent({
          model: attempt.model,
          contents: promptContents,
          config: {
            thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                phrases: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Lista de frases curtas geradas para o vídeo.',
                },
              },
              required: ['phrases'],
            },
          },
        });
        responseText = (response.text ?? '{}').trim();
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (!isTransientDemandError(err)) {
          throw err;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const parsed = JSON.parse(responseText || '{}') as { phrases?: string[] };
    const phrases = Array.isArray(parsed.phrases)
      ? parsed.phrases
          .map((p) => String(p).trim())
          .filter(Boolean)
          .slice(0, safeCount)
      : [];

    if (phrases.length === 0) {
      res.status(502).json({ error: 'Não foi possível gerar sugestões para essa descrição.' });
      return;
    }

    res.json({ phrases });
  } catch (err) {
    console.error('Erro ao gerar frases:', err);
    const { code, message } = extractApiErrorInfo(err);
    const lower = message.toLowerCase();

    if (code === 403 || code === 400 || lower.includes('api_key_invalid') || lower.includes('permission_denied')) {
      res.status(code).json({
        error: 'Chave da API inválida ou sem permissão. Verifique GEMINI_API_KEY no painel Settings > Secrets.',
      });
      return;
    }

    if (code === 503 || code === 429 || lower.includes('high demand') || lower.includes('unavailable')) {
      res.status(503).json({
        error: 'Os servidores de IA estão com pico de demanda temporário no momento. Aguarde alguns segundos e clique em Gerar novamente.',
      });
      return;
    }

    res.status(500).json({ error: 'Não foi possível gerar as sugestões agora. Tente novamente em instantes.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ScaleClip server listening on http://localhost:${PORT}`);
  });
}

startServer();
