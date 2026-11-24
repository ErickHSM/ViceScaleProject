import {
  SavedProfile,
  SavedStyle,
  TemplateBlueprint,
  TemplateProject,
  TemplateType,
  ZoneItem,
  ZonePresetId,
} from '../types/template';

export interface ZonePresetDefinition {
  id: Exclude<ZonePresetId, 'custom'>;
  title: string;
  description: string;
  blurBackground: boolean;
  items: Omit<ZoneItem, 'id'>[];
}

export const ZONE_PRESETS: ZonePresetDefinition[] = [
  {
    id: 'single_video',
    title: '1 vídeo (padrão)',
    description: 'Um único vídeo ocupando todo o espaço abaixo do tweet.',
    blurBackground: false,
    items: [{ kind: 'video', weight: 1.0 }],
  },
  {
    id: 'single_video_blur',
    title: '1 vídeo com fundo blur',
    description:
      'No Meme, o blur preenche o card inteiro (atrás do texto e do perfil); o vídeo nítido fica só na zona do meio. No Twitter, o blur preenche as laterais.',
    blurBackground: true,
    items: [{ kind: 'video', weight: 1.0 }],
  },
  {
    id: 'single_video_spacer',
    title: '1 vídeo com espaço em branco abaixo',
    description:
      'Um vídeo com uma faixa em branco embaixo — o clipe fica mais pro meio, sem colar no rodapé.',
    blurBackground: false,
    items: [
      { kind: 'video', weight: 1.0 },
      { kind: 'empty', weight: 0.35 },
    ],
  },
  {
    id: 'two_videos',
    title: '2 vídeos empilhados',
    description: 'Dois vídeos, um acima do outro (ex.: gameplay + reação).',
    blurBackground: false,
    items: [
      { kind: 'video', weight: 1.0 },
      { kind: 'video', weight: 1.0 },
    ],
  },
  {
    id: 'two_videos_spacer',
    title: '2 vídeos empilhados com espaço em branco abaixo',
    description: 'Dois vídeos empilhados e uma faixa em branco embaixo.',
    blurBackground: false,
    items: [
      { kind: 'video', weight: 1.0 },
      { kind: 'video', weight: 1.0 },
      { kind: 'empty', weight: 0.35 },
    ],
  },
  {
    id: 'video_image',
    title: 'Imagem fixa + vídeo',
    description: 'Vídeo em cima e uma imagem fixa embaixo.',
    blurBackground: false,
    items: [
      { kind: 'video', weight: 1.0 },
      { kind: 'image', weight: 0.85 },
    ],
  },
  {
    id: 'video_image_spacer',
    title: 'Imagem fixa + vídeo com espaço em branco abaixo',
    description: 'Vídeo em cima, imagem fixa embaixo e faixa em branco no rodapé.',
    blurBackground: false,
    items: [
      { kind: 'video', weight: 1.0 },
      { kind: 'image', weight: 0.85 },
      { kind: 'empty', weight: 0.35 },
    ],
  },
  {
    id: 'video_two_images',
    title: 'Vídeo + 2 imagens lado a lado',
    description:
      'Vídeo em cima e, embaixo, duas imagens divididas na horizontal (uma ao lado da outra).',
    blurBackground: false,
    items: [
      { kind: 'video', weight: 1.1 },
      { kind: 'split_images', weight: 0.8 },
    ],
  },
  {
    id: 'video_two_images_spacer',
    title: 'Vídeo + 2 imagens com espaço em branco abaixo',
    description:
      'Vídeo em cima, duas imagens lado a lado embaixo e faixa em branco no rodapé.',
    blurBackground: false,
    items: [
      { kind: 'video', weight: 1.1 },
      { kind: 'split_images', weight: 0.8 },
      { kind: 'empty', weight: 0.35 },
    ],
  },
];

export function buildZonesFromPreset(presetId: Exclude<ZonePresetId, 'custom'>): ZoneItem[] {
  const preset = ZONE_PRESETS.find((p) => p.id === presetId) ?? ZONE_PRESETS[0];
  return preset.items.map((item, idx) => ({
    id: `zone-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    kind: item.kind,
    weight: item.weight,
  }));
}

export const TEMPLATE_BLUEPRINTS: TemplateBlueprint[] = [
  {
    type: 'twitter',
    label: 'Twitter / X',
    description: 'Cabeçalho estilo post com avatar, selo verificado e vídeo abaixo.',
    defaultPhrase: 'Olha só o que rolou nesse servidor 👀',
    defaultTheme: 'light',
  },
  {
    type: 'meme',
    label: 'Meme',
    description: 'Faixa superior de destaque com vídeo central e assinatura embaixo.',
    defaultPhrase: 'POV: Você usou o formato de meme e VIRALIZOU com 3x mais!',
    defaultTheme: 'dark',
  },
  {
    type: 'viral',
    label: 'Video Viral',
    description: 'Tela dividida: vídeo no topo, legenda central e imagem de reação.',
    defaultPhrase: 'Isso aqui vai viralizar e você ainda não sabe por quê',
    defaultTheme: 'dark',
  },
  {
    type: 'raw',
    label: 'Upload sem template',
    description: 'Canvas 9:16 limpo para subir e testar qualquer vídeo sem moldura.',
    defaultPhrase: '',
    defaultTheme: 'dark',
  },
];

export const DEFAULT_APPEARANCE = {
  avatarSize: 170,
  nameFontSize: 50,
  handleFontSize: 42,
  phraseFontSize: 53,
  horizontalPadding: 94,
  topSpacing: 156,
};

export const INITIAL_SAVED_PROFILES: SavedProfile[] = [
  {
    id: 'prof-portal-games',
    name: 'portalgtavi.br',
    handle: 'portalgtavi.br',
    verified: true,
    avatarUrl: '/src/assets/images/project_thumb_neon_portrait_1795476912460.jpg',
    textAlign: 'left',
    theme: 'dark',
  },
  {
    id: 'prof-exemplo-criador',
    name: 'exemploaulao',
    handle: 'exemploaulao',
    verified: true,
    avatarUrl: '/src/assets/images/project_thumb_city_night_1795476910947.jpg',
    textAlign: 'left',
    theme: 'dark',
  },
  {
    id: 'prof-joao-clean',
    name: 'João Pedro',
    handle: 'joaopedro.clips',
    verified: true,
    avatarUrl: null,
    textAlign: 'left',
    theme: 'light',
  },
];

export const INITIAL_SAVED_STYLES: SavedStyle[] = [
  {
    id: 'style-tweet-bold',
    name: 'Tweet Padrão Bold',
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: '700',
    phraseColor: '#0F1419',
    strokeEnabled: false,
    strokeColor: '#FFFFFF',
    strokeWidth: 3,
    phraseFontSize: 54,
    horizontalPadding: 94,
    topSpacing: 156,
  },
  {
    id: 'style-meme-contorno',
    name: 'Branco com Contorno Preto',
    fontFamily: 'Outfit',
    fontWeight: '700',
    phraseColor: '#FFFFFF',
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 4,
    phraseFontSize: 56,
    horizontalPadding: 80,
    topSpacing: 120,
  },
  {
    id: 'style-amarelo-viral',
    name: 'Amarelo Viral Destaque',
    fontFamily: 'Archivo',
    fontWeight: '700',
    phraseColor: '#FACC15',
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 4,
    phraseFontSize: 58,
    horizontalPadding: 72,
    topSpacing: 110,
  },
];

export const PHRASE_COLOR_SWATCHES: string[] = [
  '#FFFFFF',
  '#0F1419',
  '#22C55E',
  '#F97316',
  '#FACC15',
  '#16A34A',
  '#2563EB',
  '#E6198E',
];

export const VIRAL_HOOK_PRESETS: string[] = [
  'POV: você finalmente achou a página perfeita pros seus clipes',
  'Ninguém está falando sobre esse detalhe no vídeo...',
  'Espere até o segundo 0:04 para entender o que aconteceu',
  'Esse formato triplicou a retenção dos nossos últimos reels',
  'Se você curte esse nicho, já salva esse vídeo antes que suma',
  '3 motivos pelos quais esse clipe bateu 1M em 24 horas',
];

export const INITIAL_PROJECTS: TemplateProject[] = [];

export function createProjectFromTemplate(templateType: TemplateType): TemplateProject {
  const blueprint = TEMPLATE_BLUEPRINTS.find((b) => b.type === templateType) ?? TEMPLATE_BLUEPRINTS[0];
  const now = new Date();
  const formattedDate = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const defaultPreset: Exclude<ZonePresetId, 'custom'> =
    templateType === 'viral' ? 'video_image' : 'single_video';

  return {
    id: `proj-${Date.now()}`,
    title: 'Novo template',
    templateType,
    status: 'rascunho',
    updatedAtLabel: formattedDate,
    coverImageUrl: '',
    profile: {
      name: 'Seu nome',
      handle: 'seuhandle',
      verified: false,
      avatarUrl: null,
      textAlign: templateType === 'twitter' ? 'left' : 'center',
      theme: blueprint.defaultTheme,
    },
    appearance: { ...DEFAULT_APPEARANCE },
    zones: {
      presetId: defaultPreset,
      blurBackground: false,
      items: buildZonesFromPreset(defaultPreset),
      videoHeightPercent: templateType === 'raw' ? 100 : templateType === 'twitter' ? 66 : 56,
      videoFit: 'cover',
      videoBorderRadius: 0,
      splitRatio: 50,
      showTopBar: templateType !== 'raw',
      showBottomBar: templateType === 'meme' || templateType === 'viral',
    },
    phrases: {
      mainPhrase: '',
      secondaryPhrase: '',
      variations: [],
      activeVariationIndex: 0,
    },
    media: {
      videoUrl: null,
      videoName: null,
      secondaryImageUrl: null,
      zoneAssets: {},
      zoneMediaItems: {},
      selectedZoneMediaId: {},
      playbackRate: 1,
      muted: true,
    },
    style: {
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: '600',
      phraseColor: null,
      strokeEnabled: false,
      strokeColor: '#000000',
      strokeWidth: 4,
      customBgColor: blueprint.defaultTheme === 'light' ? '#FFFFFF' : '#09090B',
      customTextColor: blueprint.defaultTheme === 'light' ? '#111827' : '#FFFFFF',
      useCustomColors: false,
    },
    variationsConfig: {
      combineMode: 'cross',
      stripMetadata: true,
      antiDuplicate: true,
    },
  };
}
