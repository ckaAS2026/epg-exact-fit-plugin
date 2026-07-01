const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;

const stableStringify = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${key}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return String(value);
};

export function createSourceHash(source) {
  const text = stableStringify(source);
  let hash = HASH_OFFSET;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, HASH_PRIME);
  }

  return `src_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createSourceFingerprint({ channelId, startTime, originalTitle }) {
  return [
    String(channelId || "").trim(),
    String(startTime || "").trim(),
    String(originalTitle || "").trim()
  ].filter(Boolean).join("|");
}
