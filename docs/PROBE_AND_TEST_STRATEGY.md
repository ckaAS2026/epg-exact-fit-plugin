# Probe and Test Strategy

Dieses Dokument ergaenzt `ARCHITECTURE_CONTEXT.md`. Es beschreibt nur den aktuellen technischen Pruef- und Messansatz.

## InDesign Probe

Die InDesign Probe ist die einzige gueltige Messinstanz fuer:

- Overset
- gesetzte Zeilen
- genutzte Hoehe
- Exact-Line-Match
- Exact-Height-Match

Die Probe schreibt Kandidatentext ausschliesslich in eine Probe-Zelle. Der vorherige Zellinhalt wird nach der Messung wiederhergestellt.

Die Probe schreibt niemals in die finale Zielzelle.

## Slotprofile

Ein Slotprofil ist Pflicht, bevor ein Slot gemessen oder geloest werden darf.

Ein Slotprofil enthaelt:

- `slotId`
- `exactLineCount`
- `targetHeightPt`
- Absatz- und Zeichenstilnamen
- `sourceTableLabel`
- `probeCellLabel`
- `targetCellLabel`
- Status `draft` oder `verified`

`draft` bedeutet: Struktur vorhanden, aber Layoutwerte noch nicht redaktionell/layoutseitig freigegeben.

`verified` bedeutet: Die Werte stammen aus dem echten InDesign-Kontext und duerfen fuer Solver-Laeufe verwendet werden.

## Script-Label-Aufloesung

Der MVP verwendet bestehende InDesign-Objekte. Die Slot-Zuordnung erfolgt primaer ueber vorhandene `{{EPG:...}}`-Marker in der Tabelle. Script Labels koennen zusaetzlich fuer Tabelle, Probe-Zellen und Zielzellen verwendet werden.

Pflichtlabels:

- Tabelle: `sourceTableLabel`
- Probe-Zelle: `probeCellLabel`
- Zielzelle: `targetCellLabel`

Der Table Resolver darf nur vorhandene Tabellen und Zellen aufloesen. Er darf keine Tabelle erzeugen, keine Zellen einfuegen und keine Layoutwerte korrigieren.

Der Layout Inspector liest den Zielzellen-Kontext und erzeugt daraus messbare Slotprofile.

Ein Slotprofil darf nur `verified` sein, wenn Zeilenanzahl und Zielhoehe aus dem echten Satzkontext gelesen wurden.

## Marker-Scan

`Layout pruefen` scannt bestehende Tabellenzellen nach Markern im Format:

```text
{{EPG:top.ard.primeMain}}
```

Der Scan ist read-only:

- keine Zellinhalte werden geaendert
- keine Tabellen werden erzeugt
- keine Marker werden ersetzt
- keine finalen Texte werden geschrieben

## Test-Routinen

Die Architekturtests laufen ohne externe Dependencies:

```sh
npm test
```

Geprueft wird:

- EPG-Daten werden zu `OriginalProgramme`.
- Slotgruppen entstehen vor Varianten und Solver.
- Varianten sind `basedOnOriginalOnly`.
- Varianten referenzieren `sourceHash` und `sourceFingerprint`.
- Slotprofile erzwingen Layoutwerte.
- Table Resolver findet nur gelabelte bestehende Tabellen/Zellen.
- Layout Inspector kann verifizierbare Slotprofile aus Zielzellen ableiten.
- Probe Composer stellt Probe-Zellinhalt wieder her.
- Solver verweigert Laeufe ohne InDesign Probe.
- Produktionsmodule enthalten keine verbotenen Drift-Marker wie Trunkation, Zeichenbudget oder Auto-Write.

## Verbotene Test-Abkuerzungen

Tests duerfen keine exakte Passung per Zeichenanzahl beweisen.

Tests duerfen keine Solver-Loesung ohne Probe-Messung akzeptieren.

Tests duerfen keinen Final Writer simulieren, solange keine echte `SlotSolution` mit `exactFit: true` existiert.
