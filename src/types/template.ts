export type TemplateType = 'twitter' | 'meme' | 'viral' | 'raw';

export type ProjectStatus = 'pronto' | 'rascunho' | 'falhou';

export type TextAlignment = 'left' | 'center' | 'right';

export type CardTheme = 'light' | 'dark';

export type StudioStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PlatformPreviewMode = 'clean' | 'tiktok' | 'reels' | 'shorts';

export type SidebarSection = 'home' | 'templates' | 'vicescrap' | 'pack' | 'settings';

export type ScrapedPlatform = 'tiktok' | 'instagram' | 'youtube';

export interface ScrapedVideoItem {
  id: string;
  platform: ScrapedPlatform;
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

export interface SuggestedProfile {
  handle: string;
  nickname: string;
  followers: number | null;
  verified: boolean;
}

export interface ScrapedProfileInfo {
  platform: ScrapedPlatform;
  handle: string;
  nickname: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string;
  followers: number | null;
  likes: number | null;
  videoCount: number | null;
}

export interface SavedProfile {
  id: string;
  name: string;
  handle: string;
  verified: boolean;
  avatarUrl: string | null;
  textAlign: TextAlignment;
  theme: CardTheme;
}

export interface CardAppearance {
  avatarSize: number; // px in 1080x1920 canvas space (default 170)
  nameFontSize: number; // default 50
  handleFontSize: number; // default 42
  phraseFontSize: number; // default 53
  horizontalPadding: number; // default 94
  topSpacing: number; // default 156
}

export type ZoneKind = 'video' | 'image' | 'empty' | 'split_images';

export type ZonePresetId =
  | 'single_video'
  | 'single_video_blur'
  | 'single_video_spacer'
  | 'two_videos'
  | 'two_videos_spacer'
  | 'video_image'
  | 'video_image_spacer'
  | 'video_two_images'
  | 'video_two_images_spacer'
  | 'custom';

export interface ZoneItem {
  id: string;
  kind: ZoneKind;
  weight: number; // relative height e.g. 1.00
}

export interface ZoneConfig {
  presetId: ZonePresetId;
  blurBackground: boolean;
  items: ZoneItem[];
  videoHeightPercent: number; // legacy/fallback
  videoFit: 'cover' | 'contain';
  videoBorderRadius: number; // 0..32
  splitRatio: number; // 30..70 for Video Viral split
  showTopBar: boolean;
  showBottomBar: boolean;
}

export interface StyleConfig {
  fontFamily: 'Plus Jakarta Sans' | 'DM Sans' | 'Outfit' | 'Archivo';
  fontWeight: '500' | '600' | '700';
  phraseColor: string | null;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  customBgColor: string;
  customTextColor: string;
  useCustomColors: boolean;
}

export interface SavedStyle {
  id: string;
  name: string;
  fontFamily: StyleConfig['fontFamily'];
  fontWeight: StyleConfig['fontWeight'];
  phraseColor: string;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  phraseFontSize: number;
  horizontalPadding: number;
  topSpacing: number;
}

export interface ZoneMediaAsset {
  url: string;
  name: string;
  kind: 'video' | 'image';
}

export interface ZoneMediaItem {
  id: string;
  url: string;
  name: string;
  kind: 'video' | 'image';
  durationSec: number;
  trimStart: number;
  trimEnd: number;
  zoom: number; // 1.00 .. 2.50
  panX: number; // 0 .. 100
  panY: number; // 0 .. 100
}

export interface MediaConfig {
  videoUrl: string | null;
  videoName: string | null;
  secondaryImageUrl: string | null;
  zoneAssets: Record<string, ZoneMediaAsset>;
  zoneMediaItems: Record<string, ZoneMediaItem[]>;
  selectedZoneMediaId: Record<string, string>;
  playbackRate: number;
  muted: boolean;
}

export type VariationCombineMode = 'cross' | 'unique';

export interface VariationsConfig {
  combineMode: VariationCombineMode;
  stripMetadata: boolean;
  antiDuplicate: boolean;
}

export interface TemplateProject {
  id: string;
  title: string;
  templateType: TemplateType;
  status: ProjectStatus;
  updatedAtLabel: string;
  coverImageUrl: string;
  profile: {
    name: string;
    handle: string;
    verified: boolean;
    avatarUrl: string | null;
    textAlign: TextAlignment;
    theme: CardTheme;
  };
  appearance: CardAppearance;
  zones: ZoneConfig;
  phrases: {
    mainPhrase: string;
    secondaryPhrase: string;
    variations: string[];
    activeVariationIndex: number;
  };
  media: MediaConfig;
  style: StyleConfig;
  variationsConfig?: VariationsConfig;
}

export interface TemplateBlueprint {
  type: TemplateType;
  label: string;
  description: string;
  defaultPhrase: string;
  defaultTheme: CardTheme;
}
