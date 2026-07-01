import { createSourceFingerprint, createSourceHash } from "../utils/sourceIdentity.js";

const asText = (value) => String(value || "").trim();

const normalizeTime = (value) => {
  const text = asText(value);
  const match = text.match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) {
    return text;
  }
  return `${match[1].padStart(2, "0")}.${match[2]}`;
};

const normalizeChannelId = (programme) => asText(
  programme.channelId ||
  programme.channel ||
  programme.requestedChannelLabel ||
  programme.channelName ||
  "unknown-channel"
);

export function normalizeToOriginalProgramme(programme, { slotId } = {}) {
  const channelId = normalizeChannelId(programme);
  const startTime = normalizeTime(programme.startTime || programme.time || programme.start);
  const originalTitle = asText(programme.title || programme.name || programme.programmeTitle || "Ohne Titel");
  const originalSubtitle = asText(programme.subtitle || programme.episodeTitle);
  const originalDescription = asText(programme.description || programme.desc || programme.summary || programme.text);
  const originalSource = {
    channelId,
    startTime,
    endTime: normalizeTime(programme.endTime || programme.end),
    originalTitle,
    originalSubtitle,
    originalDescription,
    genre: asText(programme.genre),
    category: asText(programme.category),
    durationMin: programme.durationMin,
    raw: programme.raw || null
  };

  const sourceHash = createSourceHash(originalSource);
  const sourceFingerprint = createSourceFingerprint({ channelId, startTime, originalTitle });

  return {
    programmeId: asText(programme.id || programme.programmeId || sourceHash),
    channelId,
    slotId: asText(slotId || programme.slotId),
    startTime,
    endTime: originalSource.endTime,
    originalTitle,
    originalSubtitle,
    originalDescription,
    genre: originalSource.genre,
    category: originalSource.category,
    durationMin: Number.isFinite(Number(programme.durationMin)) ? Number(programme.durationMin) : undefined,
    sourceHash,
    sourceFingerprint
  };
}

export function normalizeProgrammesToOriginal(programmes, options = {}) {
  if (!Array.isArray(programmes)) {
    return [];
  }

  return programmes.map((programme) => normalizeToOriginalProgramme(programme, options));
}
