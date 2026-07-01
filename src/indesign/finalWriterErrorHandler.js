/**
 * Final Writer Error Handler
 *
 * Handles all failure scenarios during write operations.
 * Ensures InDesign state is never corrupted.
 *
 * Philosophy: All-or-nothing. Never partial writes.
 * If anything fails, rollback completely.
 *
 * Architecture Rule (§ 7):
 * "Fehler bei Schreiben → Rollback (alte Werte wiederherstellen)"
 */

/**
 * Structured error for write operations.
 */
export class WriteError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "WriteError";
    this.slotId = details.slotId;
    this.reason = details.reason;
    this.cellLabel = details.cellLabel;
    this.previousContent = details.previousContent;
    this.attemptedContent = details.attemptedContent;
    this.originalError = details.originalError;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Handles cell write errors with automatic rollback.
 *
 * @param {Object} options
 * @param {Object} options.cell - InDesign cell that failed
 * @param {string} options.slotId - Slot identifier
 * @param {string} options.previousContent - Original cell content (for rollback)
 * @param {Error} options.error - Original error
 * @returns {Object} - { rolled_back: boolean, error: WriteError }
 */
export function handleCellWriteError({
  cell,
  slotId,
  previousContent,
  error
} = {}) {
  let rolled_back = false;
  let rollbackError = null;

  // Attempt rollback
  if (cell && previousContent !== undefined) {
    try {
      cell.contents = previousContent;
      rolled_back = true;
    } catch (rollbackErr) {
      rollbackError = rollbackErr;
    }
  }

  const writeError = new WriteError(
    `Failed to write slot ${slotId}: ${error?.message || "Unknown error"}`,
    {
      slotId,
      reason: "cell_write_failed",
      previousContent,
      originalError: error,
      rollbackSucceeded: rolled_back,
      rollbackError
    }
  );

  return {
    rolled_back,
    error: writeError,
    recommendation: rolled_back
      ? "✓ Cell rolled back to previous content. InDesign state preserved."
      : "✗ Rollback FAILED. InDesign state may be corrupted. Manual intervention required."
  };
}

/**
 * Handles probe/measurement errors during verification.
 *
 * @param {Object} options
 * @param {string} options.slotId
 * @param {Error} options.error
 * @returns {Object} - Error details
 */
export function handleProbeError({
  slotId,
  error
} = {}) {
  return new WriteError(
    `Probe measurement failed for slot ${slotId}: ${error?.message || "Unknown error"}`,
    {
      slotId,
      reason: "probe_measurement_failed",
      originalError: error
    }
  );
}

/**
 * Handles InDesign timeout or connection loss.
 *
 * @param {Object} options
 * @param {string} options.slotId
 * @param {number} options.timeoutMs
 * @returns {Object} - Error details
 */
export function handleInDesignTimeout({
  slotId,
  timeoutMs = 5000
} = {}) {
  return new WriteError(
    `InDesign timeout after ${timeoutMs}ms for slot ${slotId}. No response.`,
    {
      slotId,
      reason: "indesign_timeout",
      timeoutMs
    }
  );
}

/**
 * Handles table resolution errors (table not found, etc).
 *
 * @param {Object} options
 * @param {string} options.tableLabel
 * @param {string} options.slotId
 * @returns {Object} - Error details
 */
export function handleTableResolutionError({
  tableLabel,
  slotId
} = {}) {
  return new WriteError(
    `Cannot resolve table '${tableLabel}' for slot ${slotId}. Table not found or not labeled.`,
    {
      slotId,
      reason: "table_not_found",
      tableLabel
    }
  );
}

/**
 * Handles cell resolution errors.
 *
 * @param {Object} options
 * @param {string} options.cellLabel
 * @param {string} options.slotId
 * @returns {Object} - Error details
 */
export function handleCellResolutionError({
  cellLabel,
  slotId
} = {}) {
  return new WriteError(
    `Cannot resolve cell '${cellLabel}' in slot ${slotId}. Cell not found or not labeled.`,
    {
      slotId,
      reason: "cell_not_found",
      cellLabel
    }
  );
}

/**
 * Handles slot context mismatch (probe context !== final context).
 *
 * @param {Object} options
 * @param {string} options.slotId
 * @param {Object} options.probeContext
 * @param {Object} options.finalContext
 * @returns {Object} - Error details
 */
export function handleContextMismatchError({
  slotId,
  probeContext,
  finalContext
} = {}) {
  return new WriteError(
    `Slot context mismatch for ${slotId}. Probe and final cell have different layout context.`,
    {
      slotId,
      reason: "context_mismatch",
      probeContext,
      finalContext
    }
  );
}

/**
 * Batch error handler: process multiple write errors.
 *
 * @param {Array} errors - Array of WriteErrors
 * @returns {Object} - Summary and recovery info
 */
export function summarizeWriteErrors(errors) {
  const critical = errors.filter(e => e.reason === "indesign_timeout" || e.reason === "cell_write_failed");
  const recoverable = errors.filter(e => !critical.includes(e));

  const rolledBackCount = errors.filter(e => e.rolled_back).length;
  const failedRollbackCount = errors.filter(e => !e.rolled_back && e.rolled_back !== undefined).length;

  return {
    totalErrors: errors.length,
    criticalErrors: critical.length,
    recoverableErrors: recoverable.length,
    rolledBack: rolledBackCount,
    failedRollback: failedRollbackCount,
    state: failedRollbackCount > 0
      ? "CORRUPTED" // InDesign state may be corrupted
      : "RECOVERED", // All rolled back successfully
    recommendation: failedRollbackCount > 0
      ? "🚨 CRITICAL: InDesign state may be corrupted. Manual verification required."
      : "✓ All errors recovered with rollback. InDesign state preserved.",
    errorDetails: errors.map(e => ({
      slotId: e.slotId,
      reason: e.reason,
      message: e.message
    }))
  };
}

/**
 * Formats error for user-facing logging.
 *
 * @param {WriteError} error
 * @returns {string}
 */
export function formatErrorMessage(error) {
  const lines = [
    `❌ Write Error: ${error.message}`,
    `   Slot: ${error.slotId}`,
    `   Reason: ${error.reason}`,
    `   Time: ${error.timestamp}`
  ];

  if (error.cellLabel) {
    lines.push(`   Cell: ${error.cellLabel}`);
  }

  if (error.rolled_back === true) {
    lines.push(`   ✓ Rolled back successfully`);
  } else if (error.rolled_back === false) {
    lines.push(`   ✗ Rollback FAILED - State may be corrupted`);
  }

  return lines.join("\n");
}

/**
 * Retry strategy for transient errors (timeouts, connection issues).
 *
 * @param {Object} options
 * @param {Function} options.operation - Async function to retry
 * @param {number} [options.maxRetries] - Max retry count (default: 2)
 * @param {number} [options.delayMs] - Delay between retries (default: 1000)
 * @returns {Promise} - Result of operation or throws after max retries
 */
export async function retryWithBackoff({
  operation,
  maxRetries = 2,
  delayMs = 1000
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw new WriteError(
    `Operation failed after ${maxRetries} retries: ${lastError?.message}`,
    {
      reason: "max_retries_exceeded",
      originalError: lastError,
      attempts: maxRetries
    }
  );
}

/**
 * Guards against partial writes: validates preconditions before operation.
 *
 * @param {Object} options
 * @param {Function} options.validate - Pre-check function
 * @param {Function} options.execute - Write operation
 * @param {Function} options.rollback - Cleanup function
 * @returns {Promise} - Result of execute or throws
 */
export async function guarded_write({
  validate,
  execute,
  rollback
} = {}) {
  // Pre-validate
  const validation = await validate();
  if (!validation.valid) {
    throw new WriteError(
      "Pre-validation failed, write aborted",
      {
        reason: "validation_failed",
        validationErrors: validation.errors
      }
    );
  }

  // Execute
  let result;
  try {
    result = await execute();
  } catch (error) {
    // Rollback on failure
    if (rollback) {
      try {
        await rollback();
      } catch (rollbackError) {
        throw new WriteError(
          "Write failed AND rollback failed",
          {
            reason: "write_and_rollback_failed",
            writeError: error,
            rollbackError
          }
        );
      }
    }

    throw new WriteError(
      `Write operation failed: ${error?.message}`,
      {
        reason: "write_failed",
        originalError: error
      }
    );
  }

  return result;
}
