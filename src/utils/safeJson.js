export function safeParse(value, fallbackValue = null) {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Could not parse JSON.", error);
    return fallbackValue;
  }
}

export function safeStringify(value, fallbackValue = "{}") {
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn("Could not stringify JSON.", error);
    return fallbackValue;
  }
}
