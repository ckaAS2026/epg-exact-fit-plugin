# Phase 10: Probe & SlotProfile Activation Summary

## What Was Completed

### 1. **InDesign Service** (`src/services/indesignService.js`) ✅
- Bridge between UXP Plugin and InDesign Document API
- Methods:
  - `getDocument()` — Access active InDesign document
  - `resolveTable(tableLabel)` — Find table by Script Label
  - `resolveCell(table, cellLabel)` — Find cell by Script Label
  - `resolveCellByMarker(table, slotId)` — Find cell by {{EPG:slotId}} marker
  - `inspectCellLayout(table, cellLabel)` — Get line count, height, styles from cell
  - `measureTextInCell({table, cellLabel, candidateText, slotProfile})` — Measure candidate text (REAL measurement via InDesign composition)
  - `writeToCell(table, cellLabel, text)` — Write text to cell
  - `readFromCell(table, cellLabel)` — Read text from cell

**Key Feature**: `measureTextInCell()` returns a `ProbeMeasure` object with:
- `overset` — Does text overflow in InDesign?
- `composedLineCount` — Actual lines typeset by InDesign
- `usedHeightPt` — Calculated height based on line count
- `targetLineCount` / `targetHeightPt` — Expected values
- `exactLineMatch` — Boolean: match && !overset?
- `exactHeightMatch` — Boolean: height match && !overset?

### 2. **SlotProfile Auto-Registration** (`src/services/slotProfileAutoRegister.js`) ✅
- Function: `autoRegisterSlotProfiles(tableLabel)` 
- Scans InDesign table for cells matching pattern: `slot<N>.probe` and `slot<N>.target`
- For each slot pair found:
  - Inspects target cell (line count, height, styles)
  - Creates SlotProfile object with measured values
  - Registers in global registry
- Returns: `{ success, registeredCount, profiles, errors }`

**UI Integration**: Triggered by "Inspect Layout" button
```javascript
onClick("btnInspectLayout", async () => {
  const result = await autoRegisterSlotProfiles(tableLabel);
  if (result.success) {
    log(`✓ ${result.registeredCount} SlotProfile(s) registriert`);
  }
});
```

### 3. **Solver Service** (`src/services/solverService.js`) ✅
- Orchestrates the exact-fit solver with real InDesign measurements
- Methods:
  - `solveSlot({slotId, tableLabel, programmes, allVariants, onProgress})` — Solve one slot
  - `solveSlots({slotIds, tableLabel, programmesBySlot, allVariants, onProgress})` — Solve multiple slots
  - `validateSolution(solution)` — Pre-write validation

**Solver Integration Flow**:
```
1. User loads programmes (Start button)
2. User clicks "Inspect Layout"
   → SlotProfiles auto-registered with real measurements
3. User clicks "Tabelle befuellen" (Fill Table)
   → Solver runs with ProbeComposer
   → For each slot:
      a. Get SlotProfile with exactLineCount, targetHeightPt
      b. Create probeComposer that measures via InDesign
      c. Call exactFitSolver.solveSlotWithProbe()
      d. Solver iterates candidates → measures → checks exactFit
   → If exactFit: true → solution ready for Final Writer
   → If exactFit: false → solution rejected (no truncation)
```

### 4. **ViewModel Integration** (`src/ui/viewModel.js`) ✅
Updated methods:
- `inspectLayout()` — Now calls `autoRegisterSlotProfiles()`
- `fillSlots()` — Now calls `solverService.solveSlots()` with real measurements

### 5. **SlotProfile Registry Export** (`src/config/slotProfiles.js`) ✅
Added `slotProfileRegistry` object:
```javascript
export const slotProfileRegistry = {
  registerSlotProfile,
  getSlotProfile,
  getAllProfiles: listSlotProfiles,
  clearAll: clearSlotProfiles
};
```

---

## Architecture: Complete Flow (Now Active)

```
┌─────────────────────────────────────┐
│  UXP Plugin UI (index.html)          │
│  - Inspect Layout Button             │
│  - Fill Table Button                 │
└──────────────┬──────────────────────┘
               │
               ├─→ [Button Click]
               │
        ┌──────▼─────────────────────────┐
        │  InDesign Service              │
        │  - resolveTable()              │
        │  - resolveCell()               │
        │  - inspectCellLayout()         │
        │  - measureTextInCell() ★★★     │
        └──────┬──────────────────────────┘
               │
      ┌────────▼─────────────────────────────┐
      │  SlotProfile Auto-Register          │
      │  1. Scan slot1.probe, slot1.target  │
      │  2. Inspect layout (lines, height)  │
      │  3. Create SlotProfile objects      │
      │  4. Register in slotProfileRegistry │
      └────────┬─────────────────────────────┘
               │
      ┌────────▼─────────────────────────────┐
      │  Solver Service                     │
      │  1. Get SlotProfile from registry   │
      │  2. Create ProbeComposer            │
      │  3. Call exactFitSolver             │
      │  4. Solver loops:                   │
      │     - Measure candidate in probe    │
      │     - Check if exactLineMatch       │
      │     - Try next variant or rewrite   │
      │  5. Return SlotSolution             │
      └────────┬─────────────────────────────┘
               │
      ┌────────▼─────────────────────────────┐
      │  Final Writer (Next Phase)          │
      │  (Currently: Only if exactFit=true) │
      └─────────────────────────────────────┘
```

---

## What This Solves (Before: Phases 7-9 were stubbed)

| Before | After |
|--------|-------|
| ProbeComposer existed but never used | ProbeComposer now integrated in Solver |
| SlotProfiles had hard-coded defaults | SlotProfiles auto-discovered from layout |
| Final Writer blocked (no solutions) | Can now generate exactFit solutions |
| No InDesign measurement in Solver | Real measurement via `measureTextInCell()` |
| No auto-registration workflow | One-click "Inspect Layout" register |

---

## Testing the Integration

### In InDesign Plugin Environment:

1. **Inspect Layout**:
   ```
   User Action: Click "Inspect Layout"
   Expected: 
   - Log: "✓ 47 SlotProfile(s) registriert"
   - For each slot: "Slot: slot1, Zeilen: 4, Height: 48pt"
   ```

2. **Fill Table (Solve)**:
   ```
   User Action:
   - Load programmes (Start)
   - Click "Tabelle befuellen"
   Expected:
   - Log: "[1/47] Löse Slot: slot1"
   - Log: "[slot1] Probe-Composer bereit"
   - Log: "✓ GELÖST: exactFit=true (2 Varianten)"
   - Log: "Solver-Durchlauf abgeschlossen: 47/47 mit exactFit=true"
   ```

3. **Measurement Truth**:
   - Text measured in probe cell (`slot1.probe`)
   - Measurements include:
     - Line count from InDesign composition
     - Overflow status from InDesign text frame
     - Match vs. slot profile

### Expected Behavior:

✅ **Scenario: Text fits exactly**
- Candidate: "21.30 Sendungstitel" (2 lines)
- SlotProfile: exactLineCount=2, targetHeightPt=24
- Measurement: composedLineCount=2, overset=false
- Result: `exactLineMatch=true` → Solution accepted

❌ **Scenario: Text overflows**
- Candidate: "21.30 Sehr lange Sendungstitel mit viel Text" (3 lines)
- SlotProfile: exactLineCount=2, targetHeightPt=24
- Measurement: composedLineCount=3, overset=true
- Result: `exactLineMatch=false` → Solution rejected, try next variant

❌ **Scenario: Text too short**
- Candidate: "21.30" (1 line)
- SlotProfile: exactLineCount=2, targetHeightPt=24
- Measurement: composedLineCount=1, overset=false
- Result: `exactLineMatch=false` → Solution rejected, expand to next level

---

## Code Files Changed/Created

### Created:
1. **`src/services/indesignService.js`** (276 lines)
   - Full InDesign bridge with real measurement
   
2. **`src/services/slotProfileAutoRegister.js`** (155 lines)
   - Auto-discovery and registration logic
   
3. **`src/services/solverService.js`** (223 lines)
   - Orchestrates solver with probe integration
   
4. **`tests/probeActivationIntegration.test.js`** (88 lines)
   - Integration test documentation

### Modified:
1. **`src/ui/viewModel.js`**
   - `inspectLayout()`: Now calls `autoRegisterSlotProfiles()`
   - `fillSlots()`: Now calls `solverService.solveSlots()` with real measurements
   
2. **`src/config/slotProfiles.js`**
   - Added `slotProfileRegistry` export for easier access

---

## Why This Was Critical

**Before Phase 10**: 
- ✗ Solver existed but couldn't measure (no probeComposer connection)
- ✗ SlotProfiles were stubs (no real line counts)
- ✗ Final Writer remained locked (no exactFit solutions possible)
- ✗ No way to auto-discover layout from InDesign document

**After Phase 10**:
- ✅ Solver has real InDesign measurements via ProbeComposer
- ✅ SlotProfiles auto-registered from document inspection
- ✅ Final Writer can write (if solver produces exactFit=true)
- ✅ One-click "Inspect Layout" workflow

---

## Next Phase: Phase 11 (Final Writer Activation)

When ready:
1. Final Writer reads solutions from Solver
2. Validates (exactFit=true, no truncation, source-pure)
3. Writes to target cells via InDesign Service
4. Maintains all-or-nothing semantics
5. Logs QA trail

---

## Key Insights

1. **Probe Truth**: The only valid measurement is what InDesign composes in the actual cell
   - Not character count approximation
   - Not "close enough" heuristics
   - Real typeset line count via `textFrame.lines.length`

2. **Auto-registration**: Discovers slots from cell label patterns
   - Pattern: `slot<N>.probe` + `slot<N>.target`
   - One inspection → All profiles ready

3. **Solver Loop**: Now complete end-to-end
   - Measurement: Real InDesign
   - Iteration: 11-step algorithm
   - Validation: exactLineMatch && !overset
   - Result: exactFit=true or SolveFailure

---

## Todos Completed

- [x] probe-activation — Connect ProbeComposer to InDesign runtime
- [x] slot-profile-complete — Complete Slot Profiles with real values

**Both todos moved from "pending" to "done"** ✅
