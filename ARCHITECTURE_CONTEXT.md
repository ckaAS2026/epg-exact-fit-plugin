# Architecture Context: epg-exact-fit-plugin

Dieses Dokument ist die verbindliche Architektur- und Kontextgrundlage fuer das Projekt `epg-exact-fit-plugin`.
Es ist kein README und keine Implementierungsanleitung.

## 1. Projektziel

Das Plugin laedt TV-EPG-Daten, normalisiert diese Daten und erzeugt daraus Satztexte fuer eine bestehende Adobe-InDesign-Tabelle.

Das Ziel ist nicht nur "passender Text", sondern exakt zeilengenau passende Slot-Texte:

- Keine Ueberfuellung.
- Keine Unterfuellung.
- Keine Stummeltexte.
- Keine abgeschnittenen Saetze.
- Keine optisch oder semantisch halbfertigen Slots.

Jeder Slot soll am Ende im echten InDesign-Satzkontext exakt passen.

## 2. Nicht Verhandelbare Regeln (MUST RULES)

- Jede Sendung enthaelt mindestens Zeit und Titel.
- Beschreibung wird nur verwendet, wenn sinnvoll Platz vorhanden ist.
- Wiederkehrende Formate werden minimal gehalten.
- Kuenstliche Fuelltexte sind verboten.
- Trunkation und Abschneiden von Saetzen sind verboten.
- Generierte Texte duerfen niemals als Basis fuer neue Varianten verwendet werden.
- Nur Originaldaten sind Quelle fuer Varianten, Rewrites und Optimierung.
- Jede Textentscheidung muss auf Originaldaten oder einer daraus direkt erzeugten Variante beruhen.
- Der Solver darf keine semantischen Informationen erfinden.

## 3. Line-First Architektur

Zeilen sind die zentrale Ressource.

Text ist nur das Mittel, um definierte Zeilenbereiche exakt zu fuellen. Die Architektur folgt nicht dem Prinzip "Text in einen Slot pressen", sondern dem Prinzip "Zeilen exakt fuellen".

Ein Slot wird deshalb nicht primaer als Zeichenbudget betrachtet, sondern als Satzraum mit konkreter Zeilenkapazitaet. Jede Textvariante muss daran gemessen werden, wie sie im echten Layout Zeilen belegt.

## 4. Kernkomponenten

### MCP Client

Der MCP Client ist ausschliesslich fuer die technische Verbindung und Tool-Aufrufe zum MCP-Server verantwortlich.

### EPG Provider

Der EPG Provider ruft EPG-Daten ab und normalisiert sie in ein internes, stabiles Datenformat. Er veraendert keine Originaldaten semantisch.

### Slot Planner

Der Slot Planner weist normalisierte Programme festen Slots zu. Er erzeugt `OriginalProgramme`-Eintraege mit `slotId`, ohne Texte zu kuerzen, zu schreiben oder zu messen.

Marker-Slots aus der bestehenden Tabelle duerfen als Layout-Zielslot verwendet werden. Die Zuordnung Marker-Slot zu Programmen bleibt read-only und erzeugt keine Tabelleninhalte.

### Programme Classifier

Der Programme Classifier klassifiziert Sendungen als `recurrent`, `editorial` oder `highlight` und vergibt eine Prioritaet von 1 bis 5.

### Channel Matcher

Der Channel Matcher ordnet Sender robust und tolerant zu. Er behandelt Schreibweisen, Aliase, Punkt-/Leerzeichenvarianten, Gross-/Kleinschreibung und serverseitige Sender-IDs.

### Variant Factory

Die Variant Factory erzeugt diskrete Textvarianten aus Originaldaten. Varianten koennen unterschiedlich lang sein, muessen aber immer auf derselben Originalquelle beruhen.

### Slot Profiles

Slot Profiles beschreiben die redaktionellen und typografischen Vertrage eines Slots. Jeder Slot hat ein eigenes Profil mit Zielzeilen, Satzkontext, erlaubten Inhaltsstufen, Pflichtbestandteilen und Sonderregeln.

### Exact Fit Solver

Der Exact Fit Solver kombiniert Varianten und optimiert die Auswahl fuer Slots. Ziel ist die exakte Zeilenfuellung, nicht die ungefaehre Zeichennaehe.

### Rewrite Orchestrator

Der Rewrite Orchestrator erzeugt neue Varianten nur aus Originaldaten. Er darf niemals bereits generierte Varianten als Eingabe fuer weitere Varianten verwenden.

### InDesign Probe

Die InDesign Probe misst Varianten im echten InDesign-Satzkontext. Diese Messung ist die verbindliche Wahrheit fuer Zeilenanzahl, Ueberlauf und Passgenauigkeit.

### Probe Composer

Der Probe Composer schreibt Kandidatentext in eine Probe-Zelle mit echtem Satzkontext und liefert ein `ProbeMeasure`. Er schreibt nicht in die finale Zielzelle.

### Final Writer

Der Final Writer schreibt ausschliesslich final freigegebene Texte in die bestehende InDesign-Tabelle.

### QA Report

Der QA Report dokumentiert pro Slot die finale Entscheidung, verwendete Variantenstufen, Messwerte, Overflow-/Underfill-Status und problematische Sendungen.

## 5. Datenprinzipien

- Originaldaten bleiben unveraendert erhalten.
- Jede Variante referenziert ihre Originalquelle.
- Jede Entscheidung muss zur Originalquelle rueckverfolgbar sein.
- Generierte Texte sind Ausgaben, keine neuen Quellen.
- Es gibt kein Weiterverarbeiten von Kunsttexten.
- Normalisierung darf Struktur und Vergleichbarkeit herstellen, aber keine Inhalte erfinden.
- Jede gesetzte Zelle muss auf Originalsendungen, Variantenstufe und Messentscheidung rueckfuehrbar bleiben.
- KI ist optional und darf den Produktionsfluss nicht blockieren.
- Wenn KI ausfaellt, muss eine deterministische lokale Variante verfuegbar bleiben.

## 5.1 Canonical Contracts

Das neutrale Datenmodell ist verbindlich fuer alle spaeteren Schichten.

### OriginalProgramme

Ein `OriginalProgramme` enthaelt mindestens:

- `programmeId`
- `channelId`
- `slotId`
- `startTime`
- `originalTitle`
- `sourceHash`
- `sourceFingerprint`

Optionale Felder sind:

- `endTime`
- `originalSubtitle`
- `originalDescription`
- `genre`
- `category`
- `durationMin`

Originalfelder duerfen niemals durch generierte Texte ueberschrieben werden.

### ProgrammeClass

`ProgrammeClass` ist auf folgende Werte beschraenkt:

- `recurrent`
- `editorial`
- `highlight`

### ProgrammePriority

`ProgrammePriority` ist auf 1 bis 5 beschraenkt.

### VariantLevel

`VariantLevel` ist auf folgende Werte beschraenkt:

- `timeTitle`
- `micro`
- `short`
- `medium`
- `long`

### SlotProfile

Ein `SlotProfile` enthaelt:

- `slotId`
- `exactLineCount`
- `targetHeightPt`
- `paragraphStyleName`
- `timeCharacterStyleName`
- `titleCharacterStyleName`
- `bodyCharacterStyleName`
- `recurrentDefaultLevel`
- `editorialDefaultLevel`
- `highlightDefaultLevel`
- `allowDescriptionsForRecurrentOnlyWhenSpaceLeft`
- `requireChronologicalOrder`
- `mustIncludeAllProgrammes`

`exactLineCount` und `targetHeightPt` beschreiben den festen Zielkontext.

Die Stilnamen beschreiben den InDesign-Satzvertrag.

Die Default-Level bestimmen die minimale Ausgangsstufe je ProgrammeClass.

### ProgrammeVariant

Ein `ProgrammeVariant` ist eine diskrete Textvariante, die aus einem originalen `OriginalProgramme` erzeugt wurde.

Pflichtfelder sind:

- `variantId`
- `programmeId`
- `slotId`
- `level`
- `text`
- `programmeClass`
- `priority`
- `basedOnSourceHash`
- `basedOnSourceFingerprint`
- `basedOnOriginalOnly`
- `isCompletePhrase`
- `hasNoTruncation`
- `hasNoHallucinationRisk`
- `qualityScore`

Optionaler Messcache:

- `measuredInIsolation`

`basedOnOriginalOnly` muss immer `true` sein.

Eine `ProgrammeVariant` darf niemals als Quelle fuer eine weitere Variante verwendet werden. Quelle bleibt immer das originale `OriginalProgramme`.

### ProbeMeasure

Ein `ProbeMeasure` enthaelt:

- `overset`
- `composedLineCount`
- `usedHeightPt`
- `targetLineCount`
- `targetHeightPt`
- `exactLineMatch`
- `exactHeightMatch`

Optionale feinere Messfelder:

- `lastLineBaselinePt`
- `bottomGapPt`

### SlotCandidateState

Ein `SlotCandidateState` enthaelt:

- `slotId`
- `orderedProgrammeIds`
- `chosenVariantByProgrammeId`
- `concatenatedText`
- `exactFit`
- `score`
- `missingProgrammes`
- `rewriteGeneration`

Optional:

- `measure`

### RewriteRequest

Ein `RewriteRequest` enthaelt ausschliesslich Originalquellen:

- `slotId`
- `programmeId`
- `requestedLevel`
- `reason`
- `originalSourceHash`
- `originalTitle`
- `originalSubtitle`
- `originalDescription`
- `programmeClass`
- `priority`

`reason` ist auf `needMoreText`, `needLessText`, `currentVariantsDoNotFit` oder `qualityRejected` beschraenkt.

### SlotSolution

Ein `SlotSolution` enthaelt:

- `slotId`
- `finalText`
- `finalMeasure`
- `exactFit: true`
- `usedVariants`
- `rewriteCount`
- `qa`

`qa.noOverset`, `qa.noUnderfill` und `qa.allTextsSourcePure` muessen `true` sein.

## 6. Solver-Paradigma

Der Solver arbeitet vom Minimalzustand zur Expansion.

Zuerst wird die kleinste valide Darstellung betrachtet. Danach werden diskrete Erweiterungen geprueft, zum Beispiel Untertitel, Beschreibungssatz, Zusatzinformation oder alternative Formulierung.

Die Architektur ist deterministisch zuerst. KI kann Varianten veredeln, ist aber niemals die erste oder einzige Fit-Strategie.

Das Paradigma lautet:

- Minimalzustand zuerst.
- Dann kontrollierte Expansion.
- Diskrete Varianten statt weiches Kuerzen.
- Keine Zeichenanzahl als alleinige Wahrheit.
- Jede relevante Aenderung wird in InDesign gemessen.
- Ziel ist ein exact match im echten Satzkontext.
- Nur Slots mit Problemfeedback werden neu berechnet.
- Ein Fit-Loop muss abbrechen, wenn sich Messfeedback wiederholt oder keine Verbesserung mehr erreichbar ist.
- Slotprofile sind versioniert und bestimmen die erlaubten Variantenstufen.

## 6.0 Exactness Definition

Ein Slot ist nur exakt geloest, wenn alle Bedingungen gleichzeitig erfuellt sind:

- `overset === false`
- `composedLineCount === slotProfile.exactLineCount`
- `usedHeightPt === slotProfile.targetHeightPt` oder der letzte Satzstand liegt exakt auf der letzten zulaessigen Zeile/Baseline.
- Keine zusaetzliche leere Endzeile.
- Jede enthaltene Sendungsvariante ist sprachlich valide.
- Jede verwendete Variante ist source-pure und basiert auf Originaldaten.

Primaere Wahrheit sind belegte Zeilen und Satzstand im echten InDesign-Kontext. Punkt-Hoehe wird protokolliert und zur Diagnose genutzt.

## 6.1 Slot-Profile

Slotprofile sind der Vertrag zwischen Redaktion, Layout und Solver.

Ein Slotprofil definiert:

- Slot-ID.
- Zielzeilen oder Zielhoehe im echten Satzkontext.
- Erlaubte Inhaltsstufen.
- Pflichtbestandteile.
- Optionale Bestandteile.
- Stilprofil.
- Prioritaetslogik.
- Bekannte Sonderfaelle.

Slotprofile duerfen nicht implizit im Solver-Code verschwinden. Sie muessen als eigene fachliche Schicht behandelbar bleiben.

## 6.2 Variantenleiter

Jede Sendung muss mehrere diskrete Kandidatenformen bekommen.

Gueltige Grundstufen sind:

- `time + title`
- `time + title + micro`
- `time + title + short`
- `time + title + medium`
- `time + title + full`

Nicht jeder Slot muss alle Stufen erlauben. Das Slotprofil entscheidet, welche Stufen zulaessig sind.

Wiederkehrende Formate, Nachrichten, Wetter, Magazine und Standardformate sollen bevorzugt kurze deterministische Varianten erhalten.

## 6.3 Solver-Ablauf Pro Slot

Der Solver-Ablauf ist:

1. SlotProfile laden.
2. Programme des Slots einsammeln.
3. Programme klassifizieren.
4. Initialvarianten aus Originalquellen erzeugen.
5. Minimalzustand messen.
6. Wenn Minimum nicht passt: harte SolveFailure, keine weitere Kuerzung.
7. Wenn Minimum passt: diskrete Expand-Suche.
8. Nach jedem Move: Probe Composer misst im echten Satzkontext.
9. Wenn keine exakte Loesung existiert: RewriteRequest aus Originaldaten.
10. Nach maximal erlaubten Rewrite-Generationen: SolveFailure.
11. Nur exakte SlotSolution darf an Final Writer gehen.

## 7. InDesign-Regeln

- Eine bestehende InDesign-Tabelle wird verwendet.
- Es gibt keinen dynamischen Tabellenbau.
- Es gibt keine Layoutmanipulation.
- Zell-, Absatz-, Zeichen- und Tabellengeometrie werden nicht vom Solver erfunden.
- Messung erfolgt im echten Satzkontext.
- Ausgabe erfolgt erst nach erfolgreicher Passungsentscheidung.
- Der MVP verwendet den bestehenden Marker-Tabellenpfad.
- Marker haben das Format `{{EPG:<slotId>}}` und werden read-only aus bestehenden Tabellenzellen gelesen.
- Der MVP verwendet Script Labels fuer Tabelle, Probe-Zellen und Zielzellen.
- Dynamic Table ist fuer den MVP verboten und bleibt ein spaeterer Sonderfall.
- InDesign ist die verbindliche Messinstanz fuer Overflow, Underfill, Zeilenanzahl und genutzte Hoehe.
- Shadow- oder Probe-Slots muessen denselben Satzkontext nutzen wie die finale Zielzelle.
- Probe Composer darf nur in Probe-Zellen schreiben und muss deren vorherigen Inhalt nach der Messung wiederherstellen.
- Probe Composer darf niemals in finale Zielzellen schreiben.
- Table Resolver darf nur bestehende InDesign-Objekte anhand von Script Labels aufloesen.
- Layout Inspector darf Layoutwerte nur aus bestehenden Zielzellen lesen.
- Marker-Scan darf Zellinhalte nur lesen, niemals ersetzen oder final beschreiben.
- Marker-Slot-Zuordnung darf nur Programme vorbereiten, niemals Zielzellen befuellen.

## 8. UX-Prinzipien

- Das Plugin darf nie still oder tot wirken.
- Fortschritt muss sichtbar sein.
- Logging muss sichtbar sein.
- Fehler muessen transparent gemeldet werden.
- Lange Operationen muessen Zwischenstatus anzeigen.
- Nutzer muessen erkennen koennen, ob das Plugin wartet, laedt, misst, optimiert, schreibt oder fehlgeschlagen ist.
- Schreibende Aktionen in InDesign muessen explizit ausgeloest werden.
- Datenladen, Messen/Optimieren und finales Schreiben sind getrennte UX-Schritte.

## 9. Explizit Verboten

- Approximation per Zeichenanzahl als finale Entscheidungsgrundlage.
- Heuristisches Kuerzen als Ersatz fuer Variantenlogik.
- Dynamischer Tabellenbau.
- Layoutmanipulation zur Problemumgehung.
- Textabschneiden.
- Trunkation mitten im Satz.
- Rekursive Textverarbeitung generierter Texte.
- Generierte Varianten als Quelle fuer neue Varianten.
- Ungefaehr passende Loesungen.
- Kuenstliche Fuelltexte.
- Semantisches Erfinden fehlender Programminformationen.
- Blindes Auto-Refit aller Slots ohne Problemfeedback.
- Automatisches Schreiben in InDesign direkt nach dem Datenladen.
- KI-Only-Fit ohne deterministischen Fallback.

## 10. Entwicklungsstrategie

Die Entwicklung erfolgt in klar getrennten Schritten:

1. Stabile Datenpipeline.
2. Robuste Normalisierung und Senderzuordnung.
3. Slotprofile.
4. Layout Plan.
5. Variant Factory.
6. InDesign Probe.
7. Exact Fit Solver.
8. QA Report.
9. Final Writer.
10. UX- und Qualitaetsfeinschliff.

Es werden keine parallelen Grossbaustellen begonnen. Jede Schicht muss stabil sein, bevor die naechste Schicht darauf aufbaut.

## 10.1 Architekturtests

Architekturtests sind Pflicht, sobald eine neue Schicht eingefuehrt wird.

Die Tests pruefen nicht optische Endergebnisse, sondern Architektur-Invarianten:

- OriginalProgramme bleiben source-pure.
- ProgrammeVariants referenzieren Originalquellen.
- Slotprofile erzwingen explizite Layoutwerte.
- Table Resolver findet nur bestehende gelabelte Tabellen und Zellen.
- Layout Inspector erzeugt verifizierbare Profile aus Zielzellen.
- Marker-Slot-Zuordnung verbindet geladene OriginalProgramme mit vorhandenen `{{EPG:...}}` Slotmarkern.
- Probe Composer stellt Probe-Zellinhalt wieder her.
- Solver laeuft nicht ohne InDesign Probe.
- Verbotene Drift-Marker wie Trunkation, Zeichenbudget und Auto-Write werden in Kernmodulen erkannt.

Die lokale Testroutine lautet:

```sh
node tests/runArchitectureTests.js
```

Wenn `npm` verfuegbar ist, kann alternativ `npm test` verwendet werden.

## 11. Current Implementation Status

- ✅ UI: vorhanden
- ✅ MCP: integriert (basic)
- ✅ Logging: vorhanden
- ✅ Slotprofile: Grundstruktur vorhanden, echte Layoutwerte noch nicht eingetragen
- ✅ Layout Plan: Resolver/Inspector-Grundstruktur fuer bestehende Script-Label-Tabellen vorhanden
- ✅ Variant Factory: deterministische Basisvarianten vorhanden
- ✅ Solver: Guard-Skeleton vorhanden, Probe-basierter Controller vorbereitet, Aktivierung haengt an verifizierten SlotProfiles/InDesign Runtime
- ✅ InDesign Probe: Probe Composer mit Probe-Zell-Restore vorbereitet, SlotProfile-Anbindung in Services vorbereitet
- ✅ Architekturtests: vorhanden und lauffaehig via `node tests/runArchitectureTests.js`, sofern lokale Node-Runtime verfuegbar ist
- ✅ QA Report: Grundstruktur implementiert, Source-Purity-/Trunkation-Flags werden aus Varianten-/Originaldaten abgeleitet
- ✅ Final Writer: Grundstruktur implementiert, schreibt nur validierte exactFit-Solutions und rollt Batch-Fehler all-or-nothing zurueck
