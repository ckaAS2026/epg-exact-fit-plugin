import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSlotProfile } from "../src/config/slotProfiles.js";
import { inspectCellLayout } from "../src/indesign/layoutInspector.js";
import { createProbeComposer } from "../src/indesign/probeComposer.js";
import { createFinalWriter } from "../src/indesign/finalWriter.js";
import {
  extractEpgMarkers,
  findProbeCellByLabelsOrMarkers,
  findTablesWithEpgMarkers,
  findTargetCellByLabelsOrMarkers,
  scanTableForEpgMarkers,
  scanTableForEpgSlotLabels
} from "../src/indesign/epgMarkerScanner.js";
import { createTableResolver } from "../src/indesign/tableResolver.js";
import { createExactFitSolver } from "../src/services/exactFitSolver.js";
import { determineVariantLevelOrder } from "../src/services/variantLevelStrategy.js";
import { createRewriteRequest, createRewriteCounter } from "../src/services/rewriteRequestGenerator.js";
import { assignProgrammesToMarkerSlots, parseEpgSlotId } from "../src/services/markerSlotMapper.js";
import { classifyProgrammes } from "../src/services/programmeClassifier.js";
import { createInitialSlotCandidate } from "../src/services/slotCandidateFactory.js";
import { buildSlotProfileFromLayout } from "../src/services/slotProfileBuilder.js";
import { assignProgrammesToSlots, groupProgrammesBySlot } from "../src/services/slotPlanner.js";
import { createVariantsForProgrammes } from "../src/services/variantFactory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const tests = [];

const test = (name, fn) => {
  tests.push({ name, fn });
};

const sampleProgrammes = Object.freeze([
  {
    id: "ard-2015",
    channel: "ARD",
    startTime: "20.15",
    title: "Tatort",
    subtitle: "Borowski und das dunkle Netz",
    description: "Borowski ermittelt in Kiel. Ein Fall fuehrt tief in ein digitales Milieu.",
    genre: "Spielfilm"
  },
  {
    id: "ard-2145",
    channel: "ARD",
    startTime: "21.45",
    title: "Tagesthemen",
    description: "Nachrichten und Wetter."
  }
]);

test("pipeline creates source-pure OriginalProgrammes, slot groups, and variants", () => {
  const originals = classifyProgrammes(assignProgrammesToSlots(sampleProgrammes));
  const groups = groupProgrammesBySlot(originals);
  const variants = createVariantsForProgrammes(originals);

  assert.equal(originals.length, 2);
  assert.deepEqual(Object.keys(groups), ["ard.prime"]);
  assert.ok(variants.length >= 3);
  assert.ok(variants.every((variant) => variant.basedOnOriginalOnly === true));
  assert.ok(variants.every((variant) => variant.basedOnSourceHash));
  assert.ok(variants.every((variant) => variant.hasNoTruncation === true));
});

test("variant factory never uses generated variants as source", () => {
  const originals = classifyProgrammes(assignProgrammesToSlots(sampleProgrammes));
  const variants = createVariantsForProgrammes(originals);

  for (const variant of variants) {
    const source = originals.find((programme) => programme.programmeId === variant.programmeId);
    assert.ok(source, `Missing original source for ${variant.variantId}`);
    assert.equal(variant.basedOnSourceHash, source.sourceHash);
    assert.equal(variant.basedOnSourceFingerprint, source.sourceFingerprint);
    assert.equal(variant.text.includes("undefined"), false);
  }
});

test("slot profiles reject missing layout contract values", () => {
  assert.throws(() => createSlotProfile({ slotId: "ard.prime" }), /exactLineCount/);
  assert.throws(() => createSlotProfile({ slotId: "ard.prime", exactLineCount: 4 }), /targetHeightPt/);

  const profile = createSlotProfile({
    slotId: "ard.prime",
    exactLineCount: 4,
    targetHeightPt: 48,
    probeCellLabel: "epg.probe.ard.prime",
    targetCellLabel: "epg.target.ard.prime"
  });

  assert.equal(profile.status, "draft");
  assert.equal(profile.exactLineCount, 4);
  assert.equal(profile.probeCellLabel, "epg.probe.ard.prime");
});

test("probe composer restores probe cell content after measuring", async () => {
  const cell = {
    contents: "previous",
    texts: [
      {
        lines: [{}, {}, {}, {}],
        parentTextFrames: [{ overflows: false }]
      }
    ]
  };
  const profile = createSlotProfile({
    slotId: "ard.prime",
    exactLineCount: 4,
    targetHeightPt: 48,
    probeCellLabel: "probe",
    targetCellLabel: "target"
  });
  const probe = createProbeComposer({
    indesignApp: { activeDocument: {} },
    resolveCell: () => cell
  });

  const measure = await probe.measureCandidate({
    slotProfile: profile,
    candidateText: "20.15 Tatort"
  });

  assert.equal(cell.contents, "previous");
  assert.equal(measure.overset, false);
  assert.equal(measure.composedLineCount, 4);
  assert.equal(measure.exactLineMatch, true);
});

test("table resolver resolves existing table and labelled cells only", () => {
  const cell = { label: "epg.probe.ard.prime" };
  const table = { cells: [cell] };
  const app = {
    activeDocument: {
      pageItems: [
        {
          label: "epg-target-table",
          tables: [table]
        }
      ]
    }
  };
  const resolver = createTableResolver({ indesignApp: app });

  assert.equal(resolver.resolveTable("epg-target-table"), table);
  assert.equal(resolver.resolveCell("epg-target-table", "epg.probe.ard.prime"), cell);
  assert.throws(() => resolver.resolveCell("epg-target-table", "missing"), /nicht gefunden/);
});

test("marker scanner detects EPG slot cells without changing table content", () => {
  const table = {
    cells: [
      { contents: "{{EPG:top.ard.header}}" },
      { contents: "frei" },
      { contents: "{{EPG:top.ard.primeMain}}" }
    ]
  };

  assert.deepEqual(extractEpgMarkers("{{EPG:top.zdf.dayEarly}}").map((marker) => marker.slotId), ["top.zdf.dayEarly"]);
  const slots = scanTableForEpgMarkers(table);

  assert.equal(slots.length, 2);
  assert.deepEqual(slots.map((slot) => slot.slotId), ["top.ard.header", "top.ard.primeMain"]);
  assert.equal(table.cells[0].contents, "{{EPG:top.ard.header}}");
});

test("marker scanner distinguishes target and probe markers in brace notation", () => {
  const markers = extractEpgMarkers(
    "{{EPG:top.zdf.header}} {{EPG_PROBE:top.zdf.header}} {{EPG:probe.top.ard.primeMain}}"
  );

  assert.deepEqual(markers.map((marker) => marker.slotId), [
    "top.zdf.header",
    "top.ard.primeMain",
    "top.zdf.header"
  ]);
  assert.deepEqual(markers.map((marker) => marker.markerRole), [
    "target",
    "probe",
    "probe"
  ]);
});

test("target resolver finds cells by target label", () => {
  const targetCell = { label: "epg.target.top.ard.primeMain", contents: "" };
  const table = { cells: [targetCell] };
  const result = findTargetCellByLabelsOrMarkers(table, "top.ard.primeMain");

  assert.equal(result.cell, targetCell);
  assert.equal(result.method, "target-label");
});

test("target resolver finds cells by epg.targetSlotId extractLabel", () => {
  const targetCell = {
    contents: "",
    extractLabel(key) {
      return key === "epg.targetSlotId" ? "top.ard.primeMain" : "";
    }
  };
  const table = { cells: [targetCell] };
  const result = findTargetCellByLabelsOrMarkers(table, "top.ard.primeMain");

  assert.equal(result.cell, targetCell);
  assert.equal(result.method, "extractLabel:epg.targetSlotId");
});

test("target resolver keeps marker fallback", () => {
  const targetCell = { contents: "{{EPG:top.ard.primeMain}}" };
  const table = { cells: [targetCell] };
  const result = findTargetCellByLabelsOrMarkers(table, "top.ard.primeMain");

  assert.equal(result.cell, targetCell);
  assert.equal(result.method, "marker");
});

test("probe resolver finds cells by probe label", () => {
  const probeCell = { label: "epg.probe.top.ard.primeMain", contents: "" };
  const table = { cells: [probeCell] };
  const result = findProbeCellByLabelsOrMarkers([table], "top.ard.primeMain");

  assert.equal(result.cell, probeCell);
  assert.equal(result.method, "probe-label");
});

test("slot label scanner detects target labels without changing content", () => {
  const targetCell = { label: "epg.target.top.ard.primeMain", contents: "original" };
  const table = { cells: [targetCell] };
  const slots = scanTableForEpgSlotLabels(table);

  assert.equal(slots.length, 1);
  assert.equal(slots[0].slotId, "top.ard.primeMain");
  assert.equal(slots[0].source, "label");
  assert.equal(targetCell.contents, "original");
});

test("marker scanner searches app selection and page items", () => {
  const selectedTable = {
    cells: [
      { contents: "{{EPG:top.vox.primeMain}}" }
    ]
  };
  const pageItemTable = {
    cells: [
      { contents: "{{EPG:bottom.tele5.compactDay}}" }
    ]
  };
  const document = {
    stories: [],
    textFrames: [],
    pageItems: [
      {
        parentStory: {
          tables: [pageItemTable]
        }
      }
    ],
    allPageItems: []
  };
  const app = {
    selection: [selectedTable]
  };

  const results = findTablesWithEpgMarkers(document, app);
  const slotIds = results.flatMap((result) => result.slots.map((slot) => slot.slotId));

  assert.deepEqual(slotIds, ["bottom.tele5.compactDay", "top.vox.primeMain"]);
});

test("marker scanner searches document allTables", () => {
  const table = {
    cells: [
      { contents: "{{EPG:top.ard.dayEarly}}" }
    ]
  };
  const document = {
    stories: [],
    textFrames: [],
    pageItems: [],
    allPageItems: [],
    allTables: [table]
  };

  const results = findTablesWithEpgMarkers(document, { selection: [] });

  assert.equal(results.length, 1);
  assert.equal(results[0].slots[0].slotId, "top.ard.dayEarly");
});

test("marker scanner can scope duplicate labelled table holders", () => {
  const targetTable = {
    cells: [
      { contents: "{{EPG:top.zdf.dayEarly}}" }
    ]
  };
  const unrelatedTable = {
    cells: [
      { contents: "{{EPG:top.rtl.dayEarly}}" }
    ]
  };
  const document = {
    stories: [],
    textFrames: [],
    pageItems: [
      { label: "other-table", tables: [unrelatedTable] },
      { label: "epg-target-table", tables: [targetTable] }
    ],
    allPageItems: [],
    allTables: [unrelatedTable, targetTable]
  };

  const results = findTablesWithEpgMarkers(document, { selection: [] }, { tableLabel: "epg-target-table" });

  assert.equal(results.length, 1);
  assert.equal(results[0].slots[0].slotId, "top.zdf.dayEarly");
});

test("labelled item without slots does not prevent global fallback", () => {
  const emptyLabelledTable = {
    cells: [
      { contents: "keine slots" }
    ]
  };
  const globalTable = {
    cells: [
      { contents: "{{EPG:top.ard.primeMain}}" }
    ]
  };
  const document = {
    stories: [],
    textFrames: [],
    pageItems: [
      { label: "epg-target-table", tables: [emptyLabelledTable] }
    ],
    allPageItems: [],
    allTables: [globalTable]
  };

  const results = findTablesWithEpgMarkers(document, { selection: [] }, { tableLabel: "epg-target-table" });

  assert.equal(results.length, 1);
  assert.equal(results[0].slots[0].slotId, "top.ard.primeMain");
  assert.equal(results.diagnostics.labelledItemsFoundButNoSlots, true);
});

test("target and separate probe tables are scanned together", () => {
  const targetTable = {
    cells: [
      { contents: "{{EPG:top.ard.primeMain}}" }
    ]
  };
  const probeCell = { contents: "{{EPG_PROBE:top.ard.primeMain}}" };
  const probeTable = {
    cells: [probeCell]
  };
  const document = {
    stories: [],
    textFrames: [],
    pageItems: [
      { label: "epg-target-table", tables: [targetTable] },
      { label: "epg-probe-table", tables: [probeTable] }
    ],
    allPageItems: [],
    allTables: []
  };

  const results = findTablesWithEpgMarkers(document, { selection: [] }, { tableLabel: "epg-target-table" });
  const probe = findProbeCellByLabelsOrMarkers(results.allTables, "top.ard.primeMain");

  assert.equal(results.length, 1);
  assert.equal(results[0].table, targetTable);
  assert.equal(results[0].slots[0].slotId, "top.ard.primeMain");
  assert.equal(results.allTables.length, 2);
  assert.equal(probe.cell, probeCell);
  assert.equal(probe.method, "probe-marker");
  assert.equal(results.diagnostics.labelledItemsFound, true);
});

test("layout binding scanner and resolvers never write cell contents", () => {
  const targetCell = { label: "epg.target.top.ard.primeMain", contents: "target original" };
  const probeCell = { label: "epg.probe.top.ard.primeMain", contents: "probe original" };
  const table = { cells: [targetCell, probeCell] };
  const document = {
    stories: [],
    textFrames: [],
    pageItems: [{ label: "epg-target-table", tables: [table] }],
    allPageItems: [],
    allTables: []
  };

  const results = findTablesWithEpgMarkers(document, { selection: [] }, { tableLabel: "epg-target-table" });
  const target = findTargetCellByLabelsOrMarkers(table, "top.ard.primeMain");
  const probe = findProbeCellByLabelsOrMarkers([table], "top.ard.primeMain");

  assert.equal(results.length, 1);
  assert.equal(target.cell, targetCell);
  assert.equal(probe.cell, probeCell);
  assert.equal(targetCell.contents, "target original");
  assert.equal(probeCell.contents, "probe original");
});

test("final writer remains all-or-nothing when any slot is blocked", async () => {
  const targetCell = {
    contents: "Original Content",
    texts: [{ lines: [{}, {}, {}, {}], parentTextFrames: [{ overflows: false }] }]
  };
  const writer = createFinalWriter({
    indesignApp: { activeDocument: { pageItems: [] } },
    tableResolver: {
      resolveTable: () => ({ cells: [targetCell] }),
      resolveCell: () => targetCell
    }
  });
  const validSolution = {
    slotId: "slot1",
    finalText: "20.00 Nachrichten",
    finalMeasure: {
      overset: false,
      composedLineCount: 4,
      targetLineCount: 4,
      exactLineMatch: true,
      exactHeightMatch: true
    },
    exactFit: true,
    usedVariants: [{ programmeId: "p1", basedOnSourceHash: "h1", basedOnOriginalOnly: true }],
    qa: {
      noOverset: true,
      noUnderfill: true,
      allTextsSourcePure: true,
      noTruncation: true
    }
  };
  const blockedSolution = {
    ...validSolution,
    slotId: "slot2",
    exactFit: false
  };

  const result = await writer.writeSlots({
    solutions: [validSolution, blockedSolution],
    slotProfiles: [{ slotId: "slot1", sourceTableLabel: "table", targetCellLabel: "target" }],
    qaReports: []
  });

  assert.equal(result.success, false);
  assert.equal(result.written.length, 0);
  assert.equal(targetCell.contents, "Original Content");
});

test("marker scanner skips invalid InDesign-like objects without aborting scan", () => {
  const targetTable = {
    cells: [
      { contents: "{{EPG:top.ard.header}}" }
    ]
  };
  const invalidPageItem = {};

  Object.defineProperty(invalidPageItem, "cells", {
    get() {
      throw new Error("Object is invalid");
    }
  });
  Object.defineProperty(invalidPageItem, "tables", {
    get() {
      throw new Error("Object is invalid");
    }
  });

  const document = {
    stories: [],
    textFrames: [],
    pageItems: [invalidPageItem],
    allPageItems: [],
    allTables: [targetTable]
  };

  const results = findTablesWithEpgMarkers(document, { selection: [] });

  assert.equal(results.length, 1);
  assert.equal(results[0].slots[0].slotId, "top.ard.header");
});

test("marker slot mapper assigns source programmes by channel and time window", () => {
  const assignments = assignProgrammesToMarkerSlots({
    slotIds: [
      "top.ard.dayEarly",
      "top.ard.primeMain",
      "top.zdf.primeMain",
      "top.ard.header"
    ],
    programmes: [
      { id: "ard-morning", channel: "ARD", startTime: "09.00", title: "Morgenmagazin" },
      { id: "ard-prime", channel: "ARD", startTime: "20.15", title: "Tatort" },
      { id: "zdf-prime", channel: "ZDF", startTime: "20.15", title: "Film" }
    ]
  });

  assert.deepEqual(parseEpgSlotId("top.ard.primeMain"), {
    slotId: "top.ard.primeMain",
    area: "top",
    channelKey: "ard",
    slotName: "primeMain"
  });
  assert.equal(assignments.find((assignment) => assignment.slotId === "top.ard.dayEarly").programmes.length, 1);
  assert.equal(assignments.find((assignment) => assignment.slotId === "top.ard.primeMain").programmes.length, 1);
  assert.equal(assignments.find((assignment) => assignment.slotId === "top.zdf.primeMain").programmes.length, 1);
  assert.equal(assignments.find((assignment) => assignment.slotId === "top.ard.header").isContentSlot, false);
  assert.equal(assignments.find((assignment) => assignment.slotId === "top.ard.primeMain").programmes[0].slotId, "top.ard.primeMain");
});

test("marker slot mapper keeps programme sources intact", () => {
  const assignments = assignProgrammesToMarkerSlots({
    slotIds: ["bottom.kabeleins.compactPrime"],
    programmes: [
      { id: "p1", channel: "kabel eins", startTime: "20.15", title: "Abenteuer Leben" }
    ]
  });
  const programme = assignments[0].programmes[0];

  assert.equal(programme.programmeId, "p1");
  assert.equal(programme.originalTitle, "Abenteuer Leben");
  assert.ok(programme.sourceHash);
  assert.ok(programme.sourceFingerprint);
});

test("slot candidate factory creates initial source-pure time-title state", () => {
  const assignments = assignProgrammesToMarkerSlots({
    slotIds: ["top.ard.primeMain"],
    programmes: [
      {
        id: "ard-2015",
        channel: "ARD",
        startTime: "20.15",
        title: "Tatort",
        description: "Ein kompletter Originalsatz."
      },
      {
        id: "ard-2145",
        channel: "ARD",
        startTime: "21.45",
        title: "Tagesthemen"
      }
    ]
  });
  const candidate = createInitialSlotCandidate(assignments[0]);

  assert.equal(candidate.slotId, "top.ard.primeMain");
  assert.deepEqual(candidate.orderedProgrammeIds, ["ard-2015", "ard-2145"]);
  assert.equal(candidate.concatenatedText, "20.15 Tatort\n21.45 Tagesthemen");
  assert.equal(candidate.exactFit, false);
  assert.equal(candidate.rewriteGeneration, 0);
  assert.equal(candidate.missingProgrammes.length, 0);
  assert.ok(Object.values(candidate.chosenVariantByProgrammeId).every((variant) => variant.level === "timeTitle"));
  assert.ok(Object.values(candidate.chosenVariantByProgrammeId).every((variant) => variant.slotId === "top.ard.primeMain"));
  assert.ok(Object.values(candidate.chosenVariantByProgrammeId).every((variant) => variant.basedOnOriginalOnly === true));
});

test("layout inspector data can create verified slot profiles", () => {
  const cell = {
    height: 48,
    texts: [
      {
        lines: [{ appliedCharacterStyle: { name: "EPG Time" } }, {}, {}, {}],
        appliedParagraphStyle: { name: "EPG Slot" },
        appliedCharacterStyle: { name: "EPG Body" },
        overflows: false
      }
    ]
  };
  const inspectedLayout = inspectCellLayout(cell);
  const profile = buildSlotProfileFromLayout({
    slotId: "ard.prime",
    tableLabel: "epg-target-table",
    probeCellLabel: "epg.probe.ard.prime",
    targetCellLabel: "epg.target.ard.prime",
    inspectedLayout
  });

  assert.equal(profile.status, "verified");
  assert.equal(profile.exactLineCount, 4);
  assert.equal(profile.targetHeightPt, 48);
  assert.equal(profile.sourceTableLabel, "epg-target-table");
});

test("solver refuses to run without exact measurement path", async () => {
  const solver = createExactFitSolver();
  await assert.rejects(
    () => solver.solveSlot({
      slotProfile: createSlotProfile({ slotId: "ard.prime", exactLineCount: 4, targetHeightPt: 48 }),
      originalProgrammes: classifyProgrammes(assignProgrammesToSlots(sampleProgrammes)),
      variants: createVariantsForProgrammes(classifyProgrammes(assignProgrammesToSlots(sampleProgrammes)))
    }),
    /InDesign Probe/
  );
});

test("phase 7: variant level strategy respects programme class", () => {
  const mockSlotProfile = {
    slotId: "test",
    exactLineCount: 4,
    targetHeightPt: 48,
    recurrentDefaultLevel: "timeTitle",
    editorialDefaultLevel: "short",
    highlightDefaultLevel: "medium"
  };

  const recurrentOrder = determineVariantLevelOrder({
    programmeClass: "recurrent",
    slotProfile: mockSlotProfile
  });

  const highlightOrder = determineVariantLevelOrder({
    programmeClass: "highlight",
    slotProfile: mockSlotProfile
  });

  assert.ok(recurrentOrder.includes("timeTitle"), "Recurrent includes timeTitle");
  assert.ok(recurrentOrder.length <= 3, "Recurrent strategy is short");
  assert.ok(highlightOrder.length >= 3, "Highlight strategy is longer");
});

test("phase 7: rewrite request is source-pure (original data only)", () => {
  const mockOriginal = {
    programmeId: "p1",
    sourceHash: "hash1",
    originalTitle: "Test",
    programmeClass: "editorial",
    priority: 2
  };

  const rewrite = createRewriteRequest({
    slotId: "s1",
    originalProgramme: mockOriginal,
    requestedLevel: "short",
    reason: "needMoreText"
  });

  assert.equal(rewrite.basedOnOriginalOnly, true);
  assert.ok(rewrite.sourceHash);
  assert.equal(rewrite.originalTitle, "Test");
});

test("phase 7: rewrite counter prevents infinite loops", () => {
  const counter = createRewriteCounter();

  for (let i = 0; i < 5; i++) {
    counter.recordRewrite("prog1");
  }

  assert.equal(counter.getCount("prog1"), 5);

  assert.throws(() => {
    counter.recordRewrite("prog1");
  }, /Max rewrites/);
});

test("forbidden architecture drift markers are absent from production source", () => {
  const filesToScan = [
    "src/services/variantFactory.js",
    "src/services/exactFitSolver.js",
    "src/indesign/probeComposer.js",
    "src/indesign/tableResolver.js",
    "src/indesign/epgMarkerScanner.js",
    "src/indesign/layoutInspector.js",
    "src/services/slotProfileBuilder.js",
    "src/services/slotPlanner.js",
    "src/services/markerSlotMapper.js",
    "src/services/slotCandidateFactory.js",
    "src/services/variantLevelStrategy.js",
    "src/services/rewriteRequestGenerator.js",
    "src/services/solverController.js"
  ];
  const forbidden = [
    /truncate/i,
    /substring\s*\(/,
    /substr\s*\(/,
    /char(?:acter)?Budget/i,
    /approximateFit/i,
    /autoWrite/i
  ];

  for (const relativePath of filesToScan) {
    const content = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(content), false, `${relativePath} contains forbidden marker ${pattern}`);
    }
  }
});

let failed = 0;

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error && error.stack || error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} architecture tests passed.`);
}
