import { SlotSectionsByTime } from "../config/slotProfiles.js";
import { normalizeToOriginalProgramme } from "./programmeNormalizer.js";

const normalizeSlotPart = (value) => String(value || "unknown")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "unknown";

const getHour = (programme) => {
  const text = String(programme.startTime || programme.time || "").trim();
  const match = text.match(/^(\d{1,2})[.:]/);
  return match ? Number(match[1]) : null;
};

export function getSlotSectionForProgramme(programme) {
  const hour = getHour(programme);

  if (hour === null) {
    return SlotSectionsByTime.DAY;
  }

  if (hour >= 20 && hour < 23) {
    return SlotSectionsByTime.PRIME;
  }

  if (hour >= 23 || hour < 6) {
    return SlotSectionsByTime.NIGHT;
  }

  return SlotSectionsByTime.DAY;
}

export function createSlotId(programme) {
  const channelId = programme.channelId || programme.channel || programme.requestedChannelLabel;
  return `${normalizeSlotPart(channelId)}.${getSlotSectionForProgramme(programme)}`;
}

export function assignProgrammesToSlots(programmes) {
  if (!Array.isArray(programmes)) {
    return [];
  }

  return programmes.map((programme) => {
    const slotId = programme.slotId || createSlotId(programme);
    return normalizeToOriginalProgramme(programme, { slotId });
  });
}

export function groupProgrammesBySlot(originalProgrammes) {
  return (Array.isArray(originalProgrammes) ? originalProgrammes : []).reduce((groups, programme) => {
    const slotId = programme.slotId || "unknown.day";
    if (!groups[slotId]) {
      groups[slotId] = [];
    }
    groups[slotId].push(programme);
    return groups;
  }, {});
}
