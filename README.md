# EPG Exact Fit Plugin

Initiales UXP Plugin-Grundgeruest fuer Adobe InDesign.

## Umfang dieses Steps

- UXP Manifest fuer ein InDesign Panel
- Kompakte Panel UI
- Settings-Persistence ueber `localStorage`
- Zentrales Logging
- App-Controller als reine Orchestrierung
- Modularer UI-, Service-, Config- und Utils-Layer

## Bewusst noch nicht enthalten

- Keine Solver- oder Slot-Businesslogik
- Keine InDesign DOM/API-Aufrufe
- Keine Integration externer EPG APIs

## Struktur

```text
epg-exact-fit-plugin/
├── manifest.json
├── index.html
├── index.js
├── package.json
├── README.md
└── src/
    ├── app.js
    ├── styles.css
    ├── config/
    ├── services/
    ├── ui/
    ├── utils/
    └── types/
```

## Startverhalten

Beim Laden des Panels wird das Datum auf morgen gesetzt. API Key und Script Label werden aus `localStorage` geladen und bei Eingabe sofort gespeichert. Jede Button-Aktion schreibt einen Eintrag ins Log.
