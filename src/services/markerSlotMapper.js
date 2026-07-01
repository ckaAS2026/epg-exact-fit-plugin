import { normalizeToOriginalProgramme } from "./programmeNormalizer.js";

const normalizeName = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/&/g, "und")
  .replace(/\+/g, "plus")
  .replace(/[^a-z0-9]/g, "");

const CHANNEL_ALIASES = Object.freeze({
  ard: ["ard", "daserste"],
  zdf: ["zdf"],
  sat1: ["sat1", "sat.1"],
  rtl: ["rtl"],
  pro7: ["pro7", "prosieben"],
  vox: ["vox"],
  kabeleins: ["kabeleins", "kabel eins"],
  tele5: ["tele5", "tele 5"],
  rtlzwei: ["rtlzwei", "rtl zwei", "rtl2", "rtl ii"],
  sky: ["sky"],
  arte: ["arte"],
  welt: ["welt", "n24"],
  sport1: ["sport1"]
});

const SLOT_WINDOWS = Object.freeze({
  dayEarly: { start: 6 * 60, end: 12 * 60 },
  dayPrePrime: { start: 12 * 60, end: 20 * 60 },
  primeVisual: { start: 20 * 60, end: 23 * 60 },
  primeCaption: { start: 20 * 60, end: 23 * 60 },
  primeMain: { start: 20 * 60, end: 23 * 60 },
  evening: { start: 22 * 60, end: 24 * 60 },
  night: { start: 23 * 60, end: 30 * 60 },
  compactDay: { start: 6 * 60, end: 20 * 60 },
  compactPrime: { start: 20 * 60, end: 24 * 60 }
});

export function parseEpgSlotId(slotId) {
  const parts = String(slotId || "").split(".");

  return {
    slotId: String(slotId || ""),
    area: parts[0] || "",
    channelKey: parts[1] || "",
    slotName: parts.slice(2).join(".") || ""
  };
}

const parseMinutes = (timeValue) => {
  const match = String(timeValue || "").match(/^(\d{1,2})[.:](\d{2})/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

const isInWindow = (minutes, window) => {
  if (minutes === null || !window) {
    return false;
  }

  const adjustedMinutes = minutes < 6 * 60 ? minutes + 24 * 60 : minutes;
  return adjustedMinutes >= window.start && adjustedMinutes < window.end;
};

const channelMatches = (programme, channelKey) => {
  const aliases = CHANNEL_ALIASES[channelKey] || [channelKey];
  const programmeChannel = normalizeName(programme.channelId || programme.channel || programme.requestedChannelLabel);

  return aliases.some((alias) => programmeChannel === normalizeName(alias));
};

export function assignProgrammesToMarkerSlots({ programmes, slotIds }) {
  const originals = (Array.isArray(programmes) ? programmes : []).map((programme) =>
    programme && programme.sourceHash ? programme : normalizeToOriginalProgramme(programme)
  );

  return (Array.isArray(slotIds) ? slotIds : []).map((slotId) => {
    const parsed = parseEpgSlotId(slotId);
    const window = SLOT_WINDOWS[parsed.slotName] || null;
    const shouldCarryProgrammes = Boolean(window);
    const assignedProgrammes = shouldCarryProgrammes
      ? originals.filter((programme) =>
        channelMatches(programme, parsed.channelKey) &&
        isInWindow(parseMinutes(programme.startTime), window)
      ).map((programme) => ({
        ...programme,
        slotId
      }))
      : [];

    return {
      slotId,
      area: parsed.area,
      channelKey: parsed.channelKey,
      slotName: parsed.slotName,
      isContentSlot: shouldCarryProgrammes,
      programmes: assignedProgrammes
    };
  });
}
