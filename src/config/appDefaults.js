export const DEFAULT_TABLE_LABEL = "epg-target-table";

export const DEFAULT_LOG_LIMIT = 2000;

export const DEFAULT_MCP_ENDPOINT = "https://www.free-epg.de/api/mcp";

export const BUILD_LABEL = "Build 0.1.36 - UI Unblock Guard";

export const DEFAULT_CHANNELS = Object.freeze([
  {
    id: "Das Erste.de",
    label: "ARD",
    idCandidates: ["Das Erste.de", "Das.Erste.de", "Das Erste", "ard"],
    aliases: ["ARD", "Das Erste", "Das Erste HD", "ARD HD", "ard"]
  },
  {
    id: "ZDF.de",
    label: "ZDF",
    idCandidates: ["ZDF.de", "ZDF", "zdf"],
    aliases: ["ZDF", "ZDF HD", "zdf"]
  },
  {
    id: "SAT.1.de",
    label: "SAT.1",
    idCandidates: ["SAT.1.de", "SAT.1", "Sat.1", "sat1", "SAT1"],
    aliases: ["SAT.1", "Sat.1", "Sat1", "SAT1", "SAT.1 HD"]
  },
  {
    id: "RTL.de",
    label: "RTL",
    idCandidates: ["RTL.de", "RTL", "rtl"],
    aliases: ["RTL", "RTL HD", "rtl"]
  },
  {
    id: "ProSieben.de",
    label: "Pro 7",
    idCandidates: ["ProSieben.de", "ProSieben", "Pro7", "pro7"],
    aliases: ["ProSieben", "Pro7", "Pro 7", "ProSieben HD", "Pro7 HD"]
  },
  {
    id: "VOX.de",
    label: "VOX",
    idCandidates: ["VOX.de", "VOX", "Vox", "vox"],
    aliases: ["VOX", "Vox", "VOX HD"]
  },
  {
    id: "Kabel Eins.de",
    label: "kabel eins",
    idCandidates: ["Kabel Eins.de", "kabel.eins.de", "kabeleins.de", "Kabel Eins", "kabeleins"],
    aliases: ["Kabel Eins", "kabel eins", "KabelEins", "kabeleins", "Kabel Eins HD"]
  },
  {
    id: "TELE 5.de",
    label: "Tele 5",
    idCandidates: ["TELE 5.de", "Tele.5.de", "TELE5.de", "TELE 5", "Tele5", "Tele 5"],
    aliases: ["Tele 5", "Tele5", "TELE 5", "TELE5", "Tele 5 HD"]
  },
  {
    id: "RTLZWEI.de",
    label: "RTLZWEI",
    idCandidates: ["RTLZWEI.de", "RTLZWEI", "RTL Zwei", "RTL2"],
    aliases: ["RTLZWEI", "RTL Zwei", "RTL2", "RTL II", "RTLZWEI HD"]
  },
  {
    id: "SPORT1.de",
    label: "sport1",
    idCandidates: ["SPORT1.de", "SPORT1", "sport1", "Sport1"],
    aliases: ["SPORT1", "sport1", "Sport1"]
  },
  {
    id: "ARTE.de",
    label: "arte",
    idCandidates: ["ARTE.de", "ARTE", "Arte", "arte"],
    aliases: ["ARTE", "Arte", "arte"]
  },
  {
    id: "WELT.de",
    label: "WELT",
    idCandidates: ["WELT.de", "WELT", "Welt", "welt"],
    aliases: ["WELT", "Welt", "WELT HD", "N24"]
  }
]);
