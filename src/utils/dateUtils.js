const pad = (value) => String(value).padStart(2, "0");

export function getTodayDate(referenceDate = new Date()) {
  return new Date(referenceDate);
}

export function getTomorrowDate(referenceDate = new Date()) {
  const tomorrow = new Date(referenceDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

export function formatDateForInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}

export function getDateByShortcut(shortcut, referenceDate = new Date()) {
  if (shortcut === "today") {
    return formatDateForInput(getTodayDate(referenceDate));
  }

  if (shortcut === "tomorrow") {
    return formatDateForInput(getTomorrowDate(referenceDate));
  }

  return "";
}

export function isDateInputValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function timestampForLog(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(":");
}
