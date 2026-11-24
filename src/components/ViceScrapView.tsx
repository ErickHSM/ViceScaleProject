import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AtSign,
  BadgeCheck,
  Calendar,
  Check,
  Download,
  ExternalLink,
  Eye,
  Film,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import {
  ScrapedPlatform,
  ScrapedProfileInfo,
  ScrapedVideoItem,
  SuggestedProfile,
  TemplateType,
} from '../types/template';

interface ViceScrapViewProps {
  historyItems: ScrapedVideoItem[];
  onAddHistoryItem: (item: ScrapedVideoItem) => void;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onUseVideoInTemplate: (payload: {
    cacheUrl: string;
    name: string;
    durationSec: number;
    caption: string;
    coverThumbUrl: string | null;
    templateType: TemplateType;
  }) => void;
}

type ProfileSortMode = 'likes' | 'comments' | 'views' | 'recent';

function formatPtBrCompact(num: number | null): string {
  if (num === null || Number.isNaN(num)) return '—';
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} bi`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} mi`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace('.', ',').replace(/,0$/, '')} mil`;
  }
  return String(num);
}

function formatShortDate(unixSec?: number): string {
  if (!unixSec || Number.isNaN(unixSec)) return 'Recente';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(unixSec * 1000));
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export const ViceScrapView: React.FC<ViceScrapViewProps> = ({
  historyItems,
  onAddHistoryItem,
  onRemoveHistoryItem,
  onClearHistory,
  onUseVideoInTemplate,
}) => {
  const [mode, setMode] = useState<'link' | 'profile'>('link');
  const [linkInput, setLinkInput] = useState('');
  const [profileInput, setProfileInput] = useState('');
  const [profilePlatform, setProfilePlatform] = useState<ScrapedPlatform>('tiktok');
  const [profileSort, setProfileSort] = useState<ProfileSortMode>('likes');
  const [searchFilter, setSearchFilter] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const [activeProfile, setActiveProfile] = useState<ScrapedProfileInfo | null>(null);
  const [profileItems, setProfileItems] = useState<ScrapedVideoItem[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<SuggestedProfile[]>([]);
  const [latestSingleItem, setLatestSingleItem] = useState<ScrapedVideoItem | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [protectionActive, setProtectionActive] = useState(true);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);

  const [templateTargetItem, setTemplateTargetItem] = useState<ScrapedVideoItem | null>(null);
  const [isImportingId, setIsImportingId] = useState<string | null>(null);
  const [selectedTemplateType, setSelectedTemplateType] = useState<TemplateType>('twitter');

  // Instagram Graph API OAuth session held strictly in memory (never localStorage)
  const [igSessionToken, setIgSessionToken] = useState<string | null>(null);
  const [igGraphStatus, setIgGraphStatus] = useState<{
    connected: boolean;
    source: 'oauth' | 'env' | 'none';
    oauthConfigured: boolean;
    accountUsername: string | null;
    accountName: string | null;
  }>({
    connected: false,
    source: 'none',
    oauthConfigured: false,
    accountUsername: null,
    accountName: null,
  });
  const [isConnectingIgGraph, setIsConnectingIgGraph] = useState(false);

  const refreshIgGraphStatus = useCallback(async (tokenOverride?: string | null) => {
    const activeToken = tokenOverride !== undefined ? tokenOverride : igSessionToken;
    try {
      const resp = await fetch('/api/vicescrap/instagram-graph/status', {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : undefined,
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        connected?: boolean;
        source?: 'oauth' | 'env' | 'none';
        oauthConfigured?: boolean;
        accountUsername?: string | null;
        accountName?: string | null;
      };
      setIgGraphStatus({
        connected: Boolean(data.connected),
        source: data.source ?? 'none',
        oauthConfigured: Boolean(data.oauthConfigured),
        accountUsername: data.accountUsername ?? null,
        accountName: data.accountName ?? null,
      });
    } catch {
      // Keep default status on network error
    }
  }, [igSessionToken]);

  useEffect(() => {
    refreshIgGraphStatus();
  }, [refreshIgGraphStatus]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'IG_OAUTH_SUCCESS' && typeof event.data.sessionToken === 'string') {
        const nextToken = event.data.sessionToken as string;
        setIgSessionToken(nextToken);
        setIgGraphStatus((prev) => ({
          ...prev,
          connected: true,
          source: 'oauth',
          accountUsername: event.data.accountUsername || null,
          accountName: event.data.accountName || null,
        }));
        setIsConnectingIgGraph(false);
        setErrorMsg(null);
      } else if (event.data?.type === 'IG_OAUTH_ERROR') {
        setIsConnectingIgGraph(false);
        setErrorMsg(event.data.error || 'Não foi possível concluir a conexão com o Instagram Graph API.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectInstagramGraph = async () => {
    setIsConnectingIgGraph(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/auth/instagram/url');
      const data = (await resp.json()) as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        setErrorMsg(
          data.error ||
            'Configure META_APP_ID e META_APP_SECRET nas variáveis de ambiente para conectar a API Graph.'
        );
        setIsConnectingIgGraph(false);
        return;
      }
      const popup = window.open(data.url, 'instagram_graph_oauth', 'width=620,height=720');
      if (!popup) {
        setErrorMsg('Permita pop-ups no navegador para autorizar a API Graph do Instagram.');
        setIsConnectingIgGraph(false);
      }
    } catch {
      setErrorMsg('Falha ao iniciar autenticação com a API Graph do Instagram.');
      setIsConnectingIgGraph(false);
    }
  };

  const handleDisconnectInstagramGraph = async () => {
    if (igSessionToken) {
      try {
        await fetch('/api/auth/instagram/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${igSessionToken}` },
        });
      } catch {
        // Ignore network errors on logout
      }
    }
    setIgSessionToken(null);
    refreshIgGraphStatus(null);
  };

  const sortedProfileItems = useMemo(() => {
    const copy = [...profileItems];
    if (profileSort === 'likes') {
      copy.sort(
        (a, b) => (b.likes ?? -1) - (a.likes ?? -1) || (b.views ?? -1) - (a.views ?? -1)
      );
    } else if (profileSort === 'comments') {
      copy.sort(
        (a, b) => (b.comments ?? -1) - (a.comments ?? -1) || (b.likes ?? -1) - (a.likes ?? -1)
      );
    } else if (profileSort === 'views') {
      copy.sort(
        (a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.likes ?? -1) - (a.likes ?? -1)
      );
    } else {
      copy.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }
    const q = searchFilter.trim().toLowerCase();
    if (!q) return copy;
    return copy.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.authorHandle.toLowerCase().includes(q)
    );
  }, [profileItems, profileSort, searchFilter]);

  const displayedLinkItems = useMemo(() => {
    const source = latestSingleItem
      ? [latestSingleItem, ...historyItems.filter((h) => h.id !== latestSingleItem.id)]
      : historyItems;

    const q = searchFilter.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.authorHandle.toLowerCase().includes(q) ||
        item.authorName.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q)
    );
  }, [latestSingleItem, historyItems, searchFilter]);

  const downloadableProfileItems = useMemo(
    () => sortedProfileItems.filter((item) => Boolean(item.downloadUrl)),
    [sortedProfileItems]
  );

  const runProfileSearch = async (
    handleQuery: string,
    platformOverride?: ScrapedPlatform,
    sortOverride?: ProfileSortMode
  ) => {
    const clean = handleQuery.trim();
    if (!clean) {
      setErrorMsg('Informe o @usuario ou link de perfil antes de buscar.');
      return;
    }

    const lower = clean.toLowerCase();
    const detectedPlatform: ScrapedPlatform =
      platformOverride ??
      (lower.includes('instagram.com')
        ? 'instagram'
        : lower.includes('youtube.com') || lower.includes('youtu.be')
          ? 'youtube'
          : lower.includes('tiktok.com')
            ? 'tiktok'
            : profilePlatform);

    const activeSort = sortOverride ?? profileSort;

    if (detectedPlatform !== profilePlatform) {
      setProfilePlatform(detectedPlatform);
    }

    setIsLoading(true);
    setErrorMsg(null);
    setWarningMsg(null);
    setSelectedIds(new Set());
    setPlayingCardId(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (igSessionToken) {
        headers.Authorization = `Bearer ${igSessionToken}`;
      }
      const resp = await fetch('/api/vicescrap/extract', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'profile',
          query: clean,
          platform: detectedPlatform,
          sort: activeSort,
        }),
      });

      const data = (await resp.json()) as {
        error?: string;
        profile?: ScrapedProfileInfo;
        items?: ScrapedVideoItem[];
        suggestedProfiles?: SuggestedProfile[];
        warning?: string;
      };

      if (!resp.ok) {
        setErrorMsg(data.error || 'Não foi possível buscar os vídeos desse perfil.');
        setActiveProfile(null);
        setProfileItems([]);
        setSuggestedProfiles([]);
        return;
      }

      if (data.profile) {
        setActiveProfile(data.profile);
        setProfileItems(Array.isArray(data.items) ? data.items : []);
        setSuggestedProfiles(
          Array.isArray(data.suggestedProfiles) ? data.suggestedProfiles : []
        );
        if (data.warning) {
          setWarningMsg(data.warning);
        }
      }
    } catch {
      setErrorMsg('Erro de conexão ao consultar o servidor ViceScrap.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawQuery = linkInput.trim();
    if (!rawQuery) {
      setErrorMsg('Cole o link de um post/reel do Instagram, vídeo do TikTok ou YouTube Short.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setWarningMsg(null);

    try {
      const resp = await fetch('/api/vicescrap/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'link',
          query: rawQuery,
        }),
      });

      const data = (await resp.json()) as {
        error?: string;
        item?: ScrapedVideoItem;
      };

      if (!resp.ok || !data.item) {
        setErrorMsg(data.error || 'Não foi possível buscar este link.');
        return;
      }

      setLatestSingleItem(data.item);
      onAddHistoryItem(data.item);
    } catch {
      setErrorMsg('Erro de conexão ao consultar o servidor ViceScrap.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const triggerDownload = (item: ScrapedVideoItem) => {
    if (!item.downloadUrl) return;
    const url = protectionActive ? `${item.downloadUrl}&protected=1` : item.downloadUrl;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.platform}_${item.authorHandle}_${item.id}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBatchDownload = async () => {
    const selectedList = downloadableProfileItems.filter((item) => selectedIds.has(item.id));
    if (selectedList.length === 0) return;

    setIsBatchDownloading(true);
    for (const item of selectedList) {
      triggerDownload(item);
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
    setIsBatchDownloading(false);
  };

  const handleConfirmSendToTemplate = async () => {
    if (!templateTargetItem) return;
    setIsImportingId(templateTargetItem.id);
    setErrorMsg(null);

    try {
      const resp = await fetch(`/api/vicescrap/to-cache/${templateTargetItem.token}`, {
        method: 'POST',
      });
      const data = (await resp.json()) as {
        cacheUrl?: string;
        name?: string;
        durationSec?: number;
        error?: string;
      };

      if (!resp.ok || !data.cacheUrl) {
        setErrorMsg(
          data.error || 'O link temporário expirou. Clique em Buscar novamente para importar.'
        );
        setTemplateTargetItem(null);
        setIsImportingId(null);
        return;
      }

      onUseVideoInTemplate({
        cacheUrl: data.cacheUrl,
        name: data.name || `${templateTargetItem.platform}_${templateTargetItem.id}.mp4`,
        durationSec: data.durationSec || templateTargetItem.durationSec || 5,
        caption: templateTargetItem.title,
        coverThumbUrl: templateTargetItem.thumbUrl,
        templateType: selectedTemplateType,
      });
      setTemplateTargetItem(null);
    } catch {
      setErrorMsg('Falha ao transferir vídeo para o Estúdio de Templates.');
    } finally {
      setIsImportingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Buscar projetos, clipes, templates..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {mode === 'link' && historyItems.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar histórico
            </button>
          )}
          <div className="w-9 h-9 rounded-full border border-slate-200 bg-slate-50 text-slate-700 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto space-y-4">
        {/* Hero Header Card */}
        <section className="bg-white border border-slate-200/80 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#E6198E] text-white flex items-center justify-center shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
              <h1 className="font-display text-lg font-bold text-slate-900">
                ViceScrap
              </h1>
              <p className="text-xs text-slate-500">
                Baixe vídeos por um link ou diretamente de um perfil engajado.
              </p>
            </div>
          </div>

          {/* Segmented Switch: Link | Perfil */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-50 border border-slate-200 rounded-xl shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setMode('link');
                setErrorMsg(null);
                setWarningMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'link'
                  ? 'bg-[#E6198E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Link
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('profile');
                setErrorMsg(null);
                setWarningMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'profile'
                  ? 'bg-[#E6198E] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AtSign className="w-3.5 h-3.5" />
              Perfil
            </button>
          </div>
        </section>

        {/* Link Mode Search Card */}
        {mode === 'link' && (
          <section className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3">
            <form onSubmit={handleLinkSubmit} className="space-y-2.5">
              <label
                htmlFor="vicescrap-link-input"
                className="block text-xs font-semibold text-slate-800"
              >
                Link do post/reel do Instagram, vídeo do TikTok ou YouTube Short
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  id="vicescrap-link-input"
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="https://www.instagram.com/reel/... | tiktok.com/@.../video/... | youtube.com/shorts/..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 transition-all"
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#E6198E] hover:bg-[#CC147D] disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isLoading ? 'Buscando...' : 'Buscar'}</span>
                </button>
              </div>
            </form>

            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </section>
        )}

        {/* Perfil Mode Unified Toolbar */}
        {mode === 'profile' && (
          <section className="bg-white border border-slate-200/80 rounded-2xl p-3 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runProfileSearch(profileInput);
              }}
              className="flex flex-wrap items-center gap-2.5"
            >
              {/* Platform Selector: Instagram | TikTok | YouTube */}
              <div
                role="group"
                aria-label="Selecionar plataforma do perfil"
                className="inline-flex items-center gap-1 p-1 bg-slate-50 border border-slate-200 rounded-xl shrink-0"
              >
                {(
                  [
                    { id: 'instagram', label: 'Instagram' },
                    { id: 'tiktok', label: 'TikTok' },
                    { id: 'youtube', label: 'YouTube' },
                  ] as const
                ).map((plat) => (
                  <button
                    key={plat.id}
                    type="button"
                    onClick={() => {
                      setProfilePlatform(plat.id);
                      setErrorMsg(null);
                      setWarningMsg(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      profilePlatform === plat.id
                        ? 'bg-[#E6198E] text-white font-semibold shadow-xs'
                        : 'text-slate-600 font-medium hover:text-slate-900'
                    }`}
                  >
                    {plat.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={profileInput}
                onChange={(e) => setProfileInput(e.target.value)}
                placeholder={
                  profilePlatform === 'instagram'
                    ? '@usuario (ex: neymarjr)'
                    : profilePlatform === 'youtube'
                      ? '@canal (ex: MrBeast)'
                      : '@usuario (ex: gta6_leaks)'
                }
                aria-label="Nome de usuário do perfil"
                className="w-44 sm:w-52 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#E6198E] focus:ring-2 focus:ring-[#E6198E]/15 transition-all"
              />

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#E6198E] hover:bg-[#CC147D] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Buscar perfil</span>
              </button>

              {/* Sort Tabs */}
              <div className="inline-flex items-center gap-1 p-1 bg-slate-50 border border-slate-200 rounded-xl overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'likes', label: 'Mais curtidas' },
                    { id: 'comments', label: 'Mais comentários' },
                    { id: 'views', label: 'Mais visualizações' },
                    { id: 'recent', label: 'Mais recentes' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      const prevSort = profileSort;
                      setProfileSort(tab.id);
                      if (
                        activeProfile?.platform === 'youtube' &&
                        ((prevSort === 'recent') !== (tab.id === 'recent'))
                      ) {
                        runProfileSearch(activeProfile.handle, 'youtube', tab.id);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      profileSort === tab.id
                        ? 'bg-[#E6198E] text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Batch Controls Right */}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600 font-mono-tabular whitespace-nowrap">
                  {selectedIds.size} selecionado(s)
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-xs font-medium text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Limpar
                </button>

                <button
                  type="button"
                  onClick={() => setProtectionActive((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    protectionActive
                      ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <ShieldCheck
                    className={`w-3.5 h-3.5 ${
                      protectionActive ? 'text-[#E6198E]' : 'text-slate-400'
                    }`}
                  />
                  <span>{protectionActive ? 'Proteção ativa' : 'Proteção off'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleBatchDownload}
                  disabled={selectedIds.size === 0 || isBatchDownloading}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 ${
                    selectedIds.size > 0 && !isBatchDownloading
                      ? 'bg-[#E6198E] hover:bg-[#CC147D] cursor-pointer'
                      : 'bg-[#E6198E]/45 cursor-not-allowed'
                  }`}
                >
                  {isBatchDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isBatchDownloading ? 'Baixando...' : 'Baixar selecionados'}
                  </span>
                </button>
              </div>
            </form>

            {profilePlatform === 'instagram' && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <div className="flex items-center gap-2 text-slate-600 min-w-0">
                  <span className="font-semibold text-slate-800 whitespace-nowrap">
                    Instagram Graph API
                  </span>
                  {igGraphStatus.connected ? (
                    <span className="text-emerald-700 font-medium truncate">
                      Conectado
                      {igGraphStatus.accountUsername ? ` (@${igGraphStatus.accountUsername})` : ''} · Business Discovery ativo (até 150 posts)
                    </span>
                  ) : igGraphStatus.oauthConfigured ? (
                    <span className="text-slate-500">
                      Conecte sua conta profissional para buscar até 150 posts e Reels em alta pela API oficial.
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      Configure <code className="font-mono text-[11px] text-slate-700">META_APP_ID</code>/<code className="font-mono text-[11px] text-slate-700">META_APP_SECRET</code> ou <code className="font-mono text-[11px] text-slate-700">META_ACCESS_TOKEN</code> nos Segredos para ativar a API oficial (busca pública ativa como fallback).
                    </span>
                  )}
                </div>

                {igGraphStatus.connected ? (
                  igGraphStatus.source === 'oauth' && (
                    <button
                      type="button"
                      onClick={handleDisconnectInstagramGraph}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Desconectar
                    </button>
                  )
                ) : igGraphStatus.oauthConfigured ? (
                  <button
                    type="button"
                    onClick={handleConnectInstagramGraph}
                    disabled={isConnectingIgGraph}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] disabled:opacity-60 text-white text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isConnectingIgGraph && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{isConnectingIgGraph ? 'Conectando...' : 'Conectar Instagram Graph'}</span>
                  </button>
                ) : null}
              </div>
            )}

            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {warningMsg && (
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{warningMsg}</span>
              </div>
            )}

            {suggestedProfiles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-600">
                <span className="font-medium text-slate-700">
                  {activeProfile?.platform === 'youtube'
                    ? 'Canais relacionados no YouTube:'
                    : 'Perfis relacionados em alta no TikTok:'}
                </span>
                {suggestedProfiles.map((sug) => (
                  <button
                    key={sug.handle}
                    type="button"
                    onClick={() => {
                      setProfileInput(sug.handle);
                      runProfileSearch(sug.handle, activeProfile?.platform ?? profilePlatform);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 hover:bg-pink-50 border border-slate-200 hover:border-[#E6198E]/40 text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
                  >
                    <span>@{sug.handle}</span>
                    {sug.followers !== null && (
                      <span className="text-slate-500 font-mono-tabular font-normal">
                        · {formatPtBrCompact(sug.followers)}{' '}
                        {activeProfile?.platform === 'youtube' ? 'insc.' : 'seg.'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Active Profile Strip */}
        {mode === 'profile' && activeProfile && !isLoading && (
          <section className="bg-white border border-slate-200/80 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {activeProfile.avatarUrl ? (
                <img
                  src={activeProfile.avatarUrl}
                  alt={activeProfile.nickname}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-sm font-bold text-slate-900 truncate">
                    {activeProfile.nickname}
                  </span>
                  {activeProfile.verified && (
                    <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />
                  )}
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500 font-mono-tabular">
                    @{activeProfile.handle}
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500 font-medium">
                    {activeProfile.platform === 'youtube'
                      ? 'YouTube Shorts'
                      : activeProfile.platform === 'instagram'
                        ? 'Instagram'
                        : 'TikTok'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono-tabular">
                  {formatPtBrCompact(activeProfile.followers)}{' '}
                  {activeProfile.platform === 'youtube' ? 'inscritos' : 'seguidores'}
                  {activeProfile.likes !== null &&
                    ` · ${formatPtBrCompact(activeProfile.likes)} curtidas`}
                  {activeProfile.videoCount !== null &&
                    ` · ${formatPtBrCompact(activeProfile.videoCount)} vídeos`}
                </p>
              </div>
            </div>

            {downloadableProfileItems.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (selectedIds.size === downloadableProfileItems.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(downloadableProfileItems.map((i) => i.id)));
                  }
                }}
                className="text-xs font-semibold text-[#E6198E] hover:text-[#CC147D] cursor-pointer self-start sm:self-auto whitespace-nowrap"
              >
                {selectedIds.size === downloadableProfileItems.length
                  ? 'Desmarcar todos'
                  : `Selecionar todos (${downloadableProfileItems.length})`}
              </button>
            ) : (
              sortedProfileItems.length > 0 && (
                <p className="text-xs text-slate-500 self-start sm:self-auto">
                  Clique em qualquer Short para assistir aqui ou abra no YouTube
                </p>
              )
            )}
          </section>
        )}

        {/* Loading Skeleton Grid */}
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[9/16] bg-slate-100" />
                <div className="p-2.5 flex items-center justify-between">
                  <div className="h-3 bg-slate-100 rounded w-16" />
                  <div className="h-3 bg-slate-100 rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PERFIL MODE GRID (Exact Screenshot Cards) */}
        {mode === 'profile' && !isLoading && sortedProfileItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {sortedProfileItems.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isPlaying = playingCardId === item.id;

              return (
                <article
                  key={`${item.id}-${item.token}`}
                  className={`bg-white rounded-2xl overflow-hidden flex flex-col border transition-all ${
                    isSelected
                      ? 'border-[#E6198E] ring-2 ring-[#E6198E]/25'
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* 9:16 Media Area */}
                  <div
                    onClick={() => {
                      if (!isPlaying) {
                        setPlayingCardId(item.id);
                      }
                    }}
                    className="relative aspect-[9/16] bg-zinc-950 overflow-hidden cursor-pointer group"
                  >
                    {isPlaying ? (
                      item.videoStreamUrl ? (
                        <video
                          src={item.videoStreamUrl}
                          poster={item.thumbUrl ?? undefined}
                          controls
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : item.embedUrl ? (
                        <iframe
                          src={item.embedUrl}
                          title={item.title}
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      ) : null
                    ) : item.thumbUrl ? (
                      <img
                        src={item.thumbUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      />
                    ) : item.videoStreamUrl ? (
                      <video
                        src={item.videoStreamUrl}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : null}

                    {/* Top-left Quick Use in Studio Button (when downloadable MP4 is available) */}
                    {item.downloadUrl && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateTargetItem(item);
                        }}
                        className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/65 hover:bg-[#E6198E] text-white text-[10px] font-semibold backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        Usar
                      </button>
                    )}

                    {/* Top-right Circle Checkbox (when downloadable MP4 is available) */}
                    {item.downloadUrl && (
                      <button
                        type="button"
                        aria-label={isSelected ? 'Desmarcar vídeo' : 'Selecionar vídeo'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectCard(item.id);
                        }}
                        className={`absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#E6198E] border-[#E6198E] text-white shadow-sm'
                            : 'border-white/90 bg-black/25 hover:border-white hover:bg-black/45'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    )}

                    {/* Subtle Center Play Cue on Hover */}
                    {!isPlaying && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-xs">
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        </div>
                      </div>
                    )}

                    {/* Bottom-left Primary Metric Scrim (Strictly matches active sort tab) */}
                    {!isPlaying && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 pt-10 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex items-center gap-1.5 text-white text-xs font-semibold font-mono-tabular">
                        {profileSort === 'likes' ? (
                          <>
                            <Heart className="w-3.5 h-3.5 text-[#E6198E] fill-[#E6198E] shrink-0" />
                            <span>{formatPtBrCompact(item.likes)}</span>
                          </>
                        ) : profileSort === 'comments' ? (
                          <>
                            <MessageCircle className="w-3.5 h-3.5 text-sky-400 fill-sky-400/20 shrink-0" />
                            <span>{formatPtBrCompact(item.comments)}</span>
                          </>
                        ) : profileSort === 'recent' ? (
                          <>
                            <Calendar className="w-3.5 h-3.5 text-white/90 shrink-0" />
                            <span>{formatShortDate(item.createdAt)}</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5 text-white/90 shrink-0" />
                            <span>{formatPtBrCompact(item.views)}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Always show Views, Likes & Comments clearly */}
                  <div className="px-2.5 py-2 bg-white space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-1 font-mono-tabular text-slate-700">
                      <span
                        title={
                          item.views !== null
                            ? `${item.views.toLocaleString('pt-BR')} visualizações`
                            : 'Visualizações indisponíveis'
                        }
                        className={`inline-flex items-center gap-1 whitespace-nowrap ${
                          profileSort === 'views' ? 'font-semibold text-slate-900' : ''
                        }`}
                      >
                        <Eye className="w-3 h-3 text-slate-500 shrink-0" />
                        {formatPtBrCompact(item.views)}
                      </span>

                      <span
                        title={
                          item.likes !== null
                            ? `${item.likes.toLocaleString('pt-BR')} curtidas`
                            : 'Curtidas indisponíveis'
                        }
                        className={`inline-flex items-center gap-1 whitespace-nowrap ${
                          profileSort === 'likes' ? 'font-semibold text-slate-900' : ''
                        }`}
                      >
                        <Heart className="w-3 h-3 text-[#E6198E] fill-[#E6198E] shrink-0" />
                        {formatPtBrCompact(item.likes)}
                      </span>

                      <span
                        title={
                          item.comments !== null
                            ? `${item.comments.toLocaleString('pt-BR')} comentários`
                            : 'Comentários indisponíveis'
                        }
                        className={`inline-flex items-center gap-1 whitespace-nowrap ${
                          profileSort === 'comments' ? 'font-semibold text-slate-900' : ''
                        }`}
                      >
                        <MessageCircle className="w-3 h-3 text-indigo-500 fill-indigo-500/20 shrink-0" />
                        {formatPtBrCompact(item.comments)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                      <span className="font-mono-tabular truncate">
                        {formatShortDate(item.createdAt)}
                      </span>

                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-[#E6198E] font-medium whitespace-nowrap shrink-0 transition-colors"
                      >
                        <span>
                          {item.platform === 'instagram'
                            ? 'Ver Reel'
                            : item.platform === 'youtube'
                              ? 'Ver Short'
                              : 'Ver Vídeo'}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* LINK MODE EXTRACTED VIDEOS GRID */}
        {mode === 'link' && !isLoading && displayedLinkItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold text-slate-600">
                Vídeos extraídos{' '}
                <span className="font-mono-tabular text-slate-400">
                  · {displayedLinkItems.length}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayedLinkItems.map((item) => (
                <article
                  key={`${item.platform}-${item.id}-${item.token}`}
                  className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-zinc-950 border border-slate-100">
                      {item.videoStreamUrl ? (
                        <video
                          src={item.videoStreamUrl}
                          poster={item.thumbUrl ?? undefined}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-contain"
                        />
                      ) : item.embedUrl ? (
                        <iframe
                          src={item.embedUrl}
                          title={item.title}
                          allow="autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      ) : null}
                    </div>

                    <div className="px-0.5 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-800 truncate">
                          @{item.authorHandle}
                        </span>
                        <span className="font-mono-tabular shrink-0">
                          {item.platform === 'tiktok'
                            ? 'TikTok'
                            : item.platform === 'youtube'
                              ? 'YouTube'
                              : 'Instagram'}{' '}
                          · {formatDuration(item.durationSec)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed">
                        {item.title}
                      </p>

                      {(item.views !== null || item.likes !== null) && (
                        <p className="text-[11px] text-slate-400 font-mono-tabular">
                          {item.views !== null && `${formatPtBrCompact(item.views)} views`}
                          {item.views !== null && item.likes !== null && ' · '}
                          {item.likes !== null && `${formatPtBrCompact(item.likes)} curtidas`}
                          {item.comments !== null &&
                            ` · ${formatPtBrCompact(item.comments)} comentários`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    {item.downloadUrl ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => triggerDownload(item)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar MP4
                        </button>

                        <button
                          type="button"
                          onClick={() => setTemplateTargetItem(item)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Usar no vídeo
                        </button>
                      </div>
                    ) : (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Abrir no YouTube
                      </a>
                    )}

                    <div className="flex items-center justify-between px-0.5 text-[11px] text-slate-400">
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Ver original
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          if (latestSingleItem?.id === item.id) {
                            setLatestSingleItem(null);
                          }
                          onRemoveHistoryItem(item.id);
                        }}
                        className="hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Template Choice Modal when clicking "Usar" / "Usar no vídeo" */}
      {templateTargetItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-50 text-[#E6198E] flex items-center justify-center shrink-0">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Importar para novo template
                </h3>
                <p className="text-xs text-slate-500">
                  Escolha o formato inicial para montar seu clipe com este vídeo.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  { id: 'twitter', label: 'Twitter / X', desc: 'Perfil + legenda' },
                  { id: 'meme', label: 'Meme', desc: 'Texto no topo' },
                  { id: 'viral', label: 'Video Viral', desc: 'Tela dividida' },
                  { id: 'raw', label: 'Sem template', desc: 'Canvas limpo' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedTemplateType(opt.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedTemplateType === opt.id
                      ? 'border-[#E6198E] bg-pink-50/60'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900">{opt.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTemplateTargetItem(null)}
                disabled={Boolean(isImportingId)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSendToTemplate}
                disabled={Boolean(isImportingId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E6198E] hover:bg-[#CC147D] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {isImportingId && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isImportingId ? 'Importando...' : 'Abrir no Estúdio'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
