import { TemplateProject, VariationCombineMode, ZoneMediaItem } from '../types/template';

export interface GeneratedVariation {
  id: string;
  index: number;
  phrase: string;
  projectSlice: TemplateProject;
}

interface MediaSlotOptions {
  slotKey: string;
  items: (ZoneMediaItem | null)[];
}

function getSlotOptionsForProject(project: TemplateProject): MediaSlotOptions[] {
  const zones = project.zones.items;
  const firstVideoZoneId = zones.find((z) => z.kind === 'video')?.id;
  const slots: MediaSlotOptions[] = [];

  for (const zone of zones) {
    const slotKeys: { key: string; kind: 'video' | 'image' }[] =
      zone.kind === 'video'
        ? [{ key: zone.id, kind: 'video' }]
        : zone.kind === 'image'
          ? [{ key: zone.id, kind: 'image' }]
          : zone.kind === 'split_images'
            ? [
                { key: `${zone.id}-left`, kind: 'image' },
                { key: `${zone.id}-right`, kind: 'image' },
              ]
            : [];

    for (const slot of slotKeys) {
      const uploaded = project.media.zoneMediaItems?.[slot.key] ?? [];
      if (uploaded.length > 0) {
        slots.push({ slotKey: slot.key, items: uploaded });
        continue;
      }

      const legacyAsset = project.media.zoneAssets?.[slot.key];
      if (legacyAsset?.url) {
        slots.push({
          slotKey: slot.key,
          items: [
            {
              id: `legacy-${slot.key}`,
              url: legacyAsset.url,
              name: legacyAsset.name,
              kind: legacyAsset.kind,
              durationSec: 10,
              trimStart: 0,
              trimEnd: 10,
              zoom: 1,
              panX: 50,
              panY: 50,
            },
          ],
        });
        continue;
      }

      if (slot.kind === 'video' && slot.key === firstVideoZoneId && project.media.videoUrl) {
        slots.push({
          slotKey: slot.key,
          items: [
            {
              id: 'legacy-primary-video',
              url: project.media.videoUrl,
              name: project.media.videoName ?? 'Vídeo',
              kind: 'video',
              durationSec: 10,
              trimStart: 0,
              trimEnd: 10,
              zoom: 1,
              panX: 50,
              panY: 50,
            },
          ],
        });
        continue;
      }

      slots.push({ slotKey: slot.key, items: [null] });
    }
  }

  return slots;
}

function buildCrossMediaCombos(
  slots: MediaSlotOptions[],
  limit = 48
): { combos: Record<string, ZoneMediaItem | null>[]; totalCount: number } {
  const totalCount = slots.reduce((acc, s) => acc * Math.max(1, s.items.length), 1);

  let combos: Record<string, ZoneMediaItem | null>[] = [{}];
  for (const slot of slots) {
    const next: Record<string, ZoneMediaItem | null>[] = [];
    for (const existing of combos) {
      for (const item of slot.items) {
        next.push({ ...existing, [slot.slotKey]: item });
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    combos = next;
  }

  return { combos, totalCount };
}

function buildUniqueMediaCombos(slots: MediaSlotOptions[]): {
  combos: Record<string, ZoneMediaItem | null>[];
  totalCount: number;
} {
  const multiSlots = slots.filter((s) => s.items.length > 1);
  const count =
    multiSlots.length > 0 ? Math.min(...multiSlots.map((s) => s.items.length)) : 1;

  const combos: Record<string, ZoneMediaItem | null>[] = [];
  for (let i = 0; i < count; i++) {
    const map: Record<string, ZoneMediaItem | null> = {};
    for (const slot of slots) {
      map[slot.slotKey] = slot.items.length > 1 ? slot.items[i] : slot.items[0];
    }
    combos.push(map);
  }

  return { combos, totalCount: count };
}

function createVariationProjectSlice(
  base: TemplateProject,
  phrase: string,
  mediaCombo: Record<string, ZoneMediaItem | null>
): TemplateProject {
  const firstVideoZoneId = base.zones.items.find((z) => z.kind === 'video')?.id;
  const zoneMediaItems: Record<string, ZoneMediaItem[]> = {};
  const selectedZoneMediaId: Record<string, string> = {};
  const zoneAssets: TemplateProject['media']['zoneAssets'] = {};

  for (const [slotKey, item] of Object.entries(mediaCombo)) {
    if (item) {
      zoneMediaItems[slotKey] = [item];
      selectedZoneMediaId[slotKey] = item.id;
      zoneAssets[slotKey] = {
        url: item.url,
        name: item.name,
        kind: item.kind,
      };
    }
  }

  const primaryVideoItem = firstVideoZoneId ? mediaCombo[firstVideoZoneId] : null;

  return {
    ...base,
    phrases: {
      ...base.phrases,
      mainPhrase: phrase,
      variations: [phrase],
      activeVariationIndex: 0,
    },
    media: {
      ...base.media,
      muted: true,
      videoUrl: primaryVideoItem?.url ?? base.media.videoUrl,
      videoName: primaryVideoItem?.name ?? base.media.videoName,
      zoneMediaItems,
      selectedZoneMediaId,
      zoneAssets,
    },
  };
}

export function computeVariationsSummary(
  project: TemplateProject,
  mode: VariationCombineMode
): {
  crossTotal: number;
  uniqueTotal: number;
  variations: GeneratedVariation[];
} {
  const rawPhrases =
    project.phrases.variations.length > 0
      ? project.phrases.variations
      : project.phrases.mainPhrase.trim()
        ? [project.phrases.mainPhrase.trim()]
        : [''];

  const slots = getSlotOptionsForProject(project);
  const crossMedia = buildCrossMediaCombos(slots);
  const uniqueMedia = buildUniqueMediaCombos(slots);

  const crossTotal = rawPhrases.length * crossMedia.totalCount;
  const uniqueTotal =
    rawPhrases.length <= 1
      ? uniqueMedia.totalCount
      : uniqueMedia.totalCount <= 1
        ? rawPhrases.length
        : Math.min(rawPhrases.length, uniqueMedia.totalCount);

  const variations: GeneratedVariation[] = [];
  const previewCap = 40;

  if (mode === 'cross') {
    let idx = 0;
    for (let pIdx = 0; pIdx < rawPhrases.length; pIdx++) {
      for (let mIdx = 0; mIdx < crossMedia.combos.length; mIdx++) {
        if (variations.length >= previewCap) break;
        const phrase = rawPhrases[pIdx];
        const mediaCombo = crossMedia.combos[mIdx];
        variations.push({
          id: `var-cross-${pIdx}-${mIdx}`,
          index: idx++,
          phrase,
          projectSlice: createVariationProjectSlice(project, phrase, mediaCombo),
        });
      }
      if (variations.length >= previewCap) break;
    }
  } else {
    const count = Math.min(uniqueTotal, previewCap);
    for (let i = 0; i < count; i++) {
      const phrase = rawPhrases[i % rawPhrases.length];
      const mediaCombo = uniqueMedia.combos[i % uniqueMedia.combos.length];
      variations.push({
        id: `var-unique-${i}`,
        index: i,
        phrase,
        projectSlice: createVariationProjectSlice(project, phrase, mediaCombo),
      });
    }
  }

  return { crossTotal, uniqueTotal, variations };
}
