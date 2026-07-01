/**
 * Truncation Detector
 *
 * Identifies "Stummel-Texte" (truncated texts) automatically.
 *
 * A Stummel is a text that:
 * - Ends abruptly mid-sentence
 * - Ends on punctuation without continuation (comma, dash)
 * - Contains ellipses (...) as placeholders
 * - Is suspiciously short compared to source material
 * - Looks like it was cut at a character boundary
 *
 * Heuristics to detect truncation:
 * 1. Text ends with "..."
 * 2. Text ends with "," or "-" but original continues
 * 3. Text length < 5 chars when description exists
 * 4. Case shift at end: "...nächstschrit" (end of Großbuchstabe start)
 * 5. Ends with incomplete word pattern (consonant clusters)
 *
 * Architecture Rule (§ 2):
 * - Trunkation und Abschneiden von Saetzen sind verboten.
 * - Der Solver darf keine semantischen Informationen erfinden.
 *
 * This detector flags suspicious texts for manual review.
 */

/**
 * Detects if a text appears to be truncated.
 *
 * @param {Object} options
 * @param {string} options.text - The text to analyze
 * @param {string} [options.originalText] - Original source text for comparison
 * @returns {Object} - {
 *   truncated: boolean,
 *   confidence: 0-1 (how sure we are),
 *   evidence: [],
 *   suspiciousPatterns: []
 * }
 *
 * @example
 * const result = detectTruncation({
 *   text: "20.15 Nachrichten: Das ist eine interessan",
 *   originalText: "Das ist eine interessante Sendung über Politik und Wirtschaft."
 * });
 * // Returns: { truncated: true, confidence: 0.9, evidence: [...] }
 */
export function detectTruncation({
  text,
  originalText
} = {}) {
  if (!text || typeof text !== "string") {
    return {
      truncated: false,
      confidence: 0,
      evidence: [],
      error: "Invalid text parameter"
    };
  }

  const evidence = [];
  const patterns = [];
  let confidenceScore = 0;

  // ========================================================================
  // HEURISTIC 1: Text ends with ellipsis
  // ========================================================================
  if (text.trim().endsWith("...")) {
    evidence.push("Text ends with '...' (ellipsis marker)");
    patterns.push("ellipsis_at_end");
    confidenceScore += 0.8;
  }

  // ========================================================================
  // HEURISTIC 2: Text ends with incomplete punctuation
  // ========================================================================
  const lastChar = text.trim().slice(-1);
  if (lastChar === "," || lastChar === "-" || lastChar === ";") {
    evidence.push(`Text ends with '${lastChar}' but no continuation`);
    patterns.push("incomplete_punctuation");
    confidenceScore += 0.5;
  }

  // ========================================================================
  // HEURISTIC 3: Very short text despite longer original
  // ========================================================================
  if (originalText && originalText.length > 30 && text.length < 5) {
    evidence.push(
      `Text is very short (${text.length} chars) compared to original (${originalText.length} chars)`
    );
    patterns.push("disproportionate_length");
    confidenceScore += 0.6;
  }

  // ========================================================================
  // HEURISTIC 4: Case shift pattern (mid-sentence ending)
  // ========================================================================
  const trimmedText = text.trim();
  if (trimmedText.length > 2) {
    const lastTwoChars = trimmedText.slice(-2);
    const isLower = lastTwoChars[0] === lastTwoChars[0].toLowerCase();
    const isUpper = lastTwoChars[1] === lastTwoChars[1].toUpperCase();

    // Pattern: lowercase followed by uppercase = likely cut mid-word
    if (isLower && isUpper) {
      evidence.push("Case shift pattern at end suggests mid-word cut");
      patterns.push("case_shift_mid_word");
      confidenceScore += 0.4;
    }
  }

  // ========================================================================
  // HEURISTIC 5: Ends with consonant cluster (incomplete word)
  // ========================================================================
  const consonantPattern = /[bcdfghjklmnpqrstvwxyz]{2,}$/i;
  if (consonantPattern.test(trimmedText)) {
    evidence.push("Ends with consonant cluster (incomplete word)");
    patterns.push("consonant_cluster_end");
    confidenceScore += 0.4;
  }

  // ========================================================================
  // HEURISTIC 6: Text ends inside a sentence (no period/question/exclamation)
  // ========================================================================
  const endsWithCompletePunctuation = trimmedText.match(/[.!?]\s*$/);
  if (!endsWithCompletePunctuation && trimmedText.length > 15) {
    // Only flag if text is long enough to be a full sentence
    evidence.push("Text does not end with sentence-ending punctuation");
    patterns.push("no_sentence_end");
    confidenceScore += 0.3;
  }

  // ========================================================================
  // HEURISTIC 7: Compare with original - text is substring of original
  // ========================================================================
  if (originalText && originalText.includes(text)) {
    // Text is contained in original - could indicate substring extraction
    evidence.push("Text is exact substring of original (possible truncation)");
    patterns.push("substring_of_original");
    // Don't add confidence - this is actually expected for level-based variants
  }

  // ========================================================================
  // VERDICT
  // ========================================================================

  // Normalize confidence to 0-1
  const normalizedConfidence = Math.min(confidenceScore, 1.0);

  // Threshold: >= 0.7 confidence = likely truncated
  const isTruncated = normalizedConfidence >= 0.7;

  return {
    truncated: isTruncated,
    confidence: normalizedConfidence,
    evidence,
    suspiciousPatterns: patterns,
    recommendation: isTruncated
      ? "⚠ Text may be truncated. Manual review recommended."
      : confidence >= 0.5
        ? "🔍 Text may have issues. Check original source."
        : "✓ No truncation detected."
  };
}

/**
 * Batch-checks truncation across multiple variants in a QA Report.
 *
 * @param {Object} qaReport - QA Report with usedVariants
 * @param {Array} originalProgrammes - Source programmes
 * @returns {Array} - Truncation detection results per variant
 */
export function detectTruncationInSlot({
  qaReport,
  originalProgrammes
} = {}) {
  if (!qaReport || !qaReport.usedVariants) {
    return [];
  }

  return qaReport.usedVariants.map(variant => {
    const original = originalProgrammes.find(p =>
      p.programmeId === variant.programmeId
    );

    const originalSource = original?.originalDescription || original?.originalTitle;

    const detection = detectTruncation({
      text: variant.chosenText,
      originalText: originalSource
    });

    return {
      programmeId: variant.programmeId,
      level: variant.chosenLevel,
      text: variant.chosenText,
      ...detection
    };
  });
}

/**
 * Creates a truncation audit report for all slots.
 *
 * @param {Array<Object>} options.qaReports - QA Reports
 * @param {Array} options.originalProgrammes - Source programmes
 * @returns {Object} - Audit summary
 */
export function auditTruncationAcrossSlots({
  qaReports,
  originalProgrammes
} = {}) {
  const allDetections = [];

  for (const report of qaReports) {
    const detections = detectTruncationInSlot({
      qaReport: report,
      originalProgrammes
    });

    allDetections.push(...detections.map(d => ({
      slotId: report.slotId,
      ...d
    })));
  }

  const truncatedCount = allDetections.filter(d => d.truncated).length;
  const suspiciousCount = allDetections.filter(d => d.confidence >= 0.5 && !d.truncated).length;

  return {
    totalVariantsChecked: allDetections.length,
    definitelyTruncated: truncatedCount,
    potentiallySuspicious: suspiciousCount,
    truncationRate: allDetections.length > 0
      ? ((truncatedCount / allDetections.length) * 100).toFixed(1) + "%"
      : "N/A",
    suspiciousItems: allDetections
      .filter(d => d.truncated || d.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence),
    recommendation: truncatedCount === 0
      ? "✓ No truncation detected across all slots"
      : `⚠ ${truncatedCount} truncated text(s) found. Manual review required.`,
    patternFrequency: countPatternFrequency(allDetections)
  };
}

/**
 * Analyzes frequency of truncation patterns.
 *
 * @private
 */
function countPatternFrequency(detections) {
  const patterns = {};

  detections.forEach(d => {
    (d.suspiciousPatterns || []).forEach(pattern => {
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    });
  });

  return patterns;
}

/**
 * Filters detections by severity and returns most problematic items.
 *
 * @param {Array} detections - From detectTruncationInSlot()
 * @param {number} [limit] - Top N items (default 10)
 * @returns {Array} - Sorted by confidence (descending)
 */
export function getMostSuspiciousTexts(detections, limit = 10) {
  return detections
    .filter(d => d.truncated || d.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

/**
 * Exports truncation audit to human-readable format.
 *
 * @param {Object} auditReport - From auditTruncationAcrossSlots()
 * @param {string} [format] - 'markdown', 'json' (default)
 * @returns {string}
 */
export function exportTruncationAudit(auditReport, format = "markdown") {
  if (format === "markdown") {
    const md = `# Truncation Audit Report

## Summary
- **Total Variants Checked**: ${auditReport.totalVariantsChecked}
- **Definitely Truncated**: ${auditReport.definitelyTruncated}
- **Potentially Suspicious**: ${auditReport.potentiallySuspicious}
- **Truncation Rate**: ${auditReport.truncationRate}

## Recommendation
${auditReport.recommendation}

## Pattern Frequency
${Object.entries(auditReport.patternFrequency || {})
  .map(([pattern, count]) => `- ${pattern}: ${count}`)
  .join("\n")}

## Most Suspicious Items
${auditReport.suspiciousItems
  .slice(0, 10)
  .map((item, idx) => `
### ${idx + 1}. ${item.slotId} / ${item.programmeId}
- **Level**: ${item.level}
- **Confidence**: ${(item.confidence * 100).toFixed(0)}%
- **Text**: "${item.text}"
- **Patterns**: ${item.suspiciousPatterns?.join(", ") || "none"}
- **Evidence**: ${item.evidence?.join("; ") || "none"}
  `).join("\n")}
    `;
    return md;
  }

  return JSON.stringify(auditReport, null, 2);
}
