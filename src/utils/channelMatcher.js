const asArray = (value) => Array.isArray(value) ? value : (value ? [value] : []);

export const normalizeChannelName = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/&/g, "und")
  .replace(/\+/g, "plus")
  .replace(/[^a-z0-9]/g, "");

export const uniqueStrings = (values) => {
  const seen = new Set();
  const result = [];

  asArray(values).filter(Boolean).forEach((value) => {
    const normalizedValue = String(value).trim();
    if (!normalizedValue || seen.has(normalizedValue)) {
      return;
    }

    seen.add(normalizedValue);
    result.push(normalizedValue);
  });

  return result;
};

export const expandChannelIdCandidates = (channel) => {
  const explicit = uniqueStrings([
    channel && channel.id,
    ...asArray(channel && channel.idCandidates)
  ]);
  const derived = [];

  explicit.forEach((id) => {
    const value = String(id || "").trim();
    if (!value) {
      return;
    }

    derived.push(value);
    derived.push(value.replace(/\s+/g, "."));
    derived.push(value.replace(/\./g, " "));
    derived.push(value.replace(/\.de$/i, ""));
  });

  return uniqueStrings([...explicit, ...derived]);
};

export const getChannelAliases = (channel) => uniqueStrings([
  channel && channel.label,
  channel && channel.id,
  ...asArray(channel && channel.aliases),
  ...expandChannelIdCandidates(channel)
]);

export const isChannelMatch = (candidate, aliases) => {
  const normalizedCandidate = normalizeChannelName(candidate);
  const normalizedAliases = uniqueStrings(aliases).map(normalizeChannelName).filter(Boolean);

  if (!normalizedCandidate || !normalizedAliases.length) {
    return false;
  }

  return normalizedAliases.some((alias) => {
    if (!alias) {
      return false;
    }

    return normalizedCandidate === alias ||
      normalizedCandidate.includes(alias) ||
      alias.includes(normalizedCandidate);
  });
};

export const matchProgrammesByChannel = (programmes, aliases) => {
  if (!Array.isArray(programmes) || !programmes.length) {
    return {
      programmes: [],
      hasChannelText: false
    };
  }

  if (!aliases || !aliases.length) {
    return {
      programmes,
      hasChannelText: true
    };
  }

  const mapped = programmes.map((programme) => {
    const raw = programme.raw || {};
    const channelTexts = uniqueStrings([
      programme.channel,
      raw.channel,
      raw.channelName,
      raw.station,
      raw.stationName,
      raw.sender,
      raw.broadcaster,
      raw.network,
      raw.service,
      raw.id,
      raw.channelId
    ]);

    return {
      programme,
      channelTexts
    };
  });

  const hasChannelText = mapped.some((entry) => entry.channelTexts.length > 0);
  if (!hasChannelText) {
    return {
      programmes,
      hasChannelText: false
    };
  }

  return {
    programmes: mapped
      .filter((entry) => entry.channelTexts.some((text) => isChannelMatch(text, aliases)))
      .map((entry) => entry.programme),
    hasChannelText: true
  };
};
