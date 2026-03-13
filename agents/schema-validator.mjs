/**
 * schema-validator.mjs
 *
 * Lightweight data-contract validator for the agentic SDLC framework.
 * Loads JSON Schema draft-07 files from agents/schemas/ and validates
 * arbitrary data objects against them using Ajv (if installed).
 *
 * Usage:
 *   import { validate } from './schema-validator.mjs';
 *
 *   const result = validate('task-claim', { taskId: 'T-1', ... });
 *   // { valid: true }
 *   // { valid: false, errors: [{ field: '/taskId', message: 'must be string' }] }
 *   // { valid: true, warning: 'ajv not installed, validation skipped' }
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const SCHEMAS_DIR = path.join(__dirname, 'schemas');

// ── Schema cache ──────────────────────────────────────────────────────────────
/** @type {Map<string, object>} schemaName → parsed JSON Schema */
const schemaCache = new Map();

/**
 * Load (and cache) a schema by name.
 * @param {string} schemaName  e.g. "task-claim"
 * @returns {object}  Parsed JSON Schema object
 */
function loadSchema(schemaName) {
  if (schemaCache.has(schemaName)) {
    return schemaCache.get(schemaName);
  }

  const schemaPath = path.join(SCHEMAS_DIR, `${schemaName}.schema.json`);
  let schema;
  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  } catch (err) {
    throw new Error(
      `schema-validator: cannot load schema "${schemaName}" from ${schemaPath} — ${err.message}`
    );
  }

  schemaCache.set(schemaName, schema);
  return schema;
}

// ── Ajv cache ─────────────────────────────────────────────────────────────────
/** @type {null | false | import('ajv').default} null = not yet tried, false = unavailable */
let _ajv = null;

/**
 * Attempt to load Ajv once. Returns the Ajv instance or false if unavailable.
 */
async function getAjv() {
  if (_ajv !== null) return _ajv;

  try {
    // Ajv v8 ships as ESM-compatible; support both v6 (CJS default export) and v8.
    const mod = await import('ajv');
    const AjvClass = mod.default ?? mod;
    _ajv = new AjvClass({ allErrors: true, strict: false });
  } catch {
    _ajv = false;
  }

  return _ajv;
}

// ── Compiled-validator cache ──────────────────────────────────────────────────
/** @type {Map<string, import('ajv').ValidateFunction>} schemaName → compiled validator */
const validatorCache = new Map();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate `data` against the named schema.
 *
 * @param {string} schemaName  Schema name without path or extension,
 *                             e.g. "task-claim", "review-result".
 * @param {unknown} data       The object to validate.
 * @returns {Promise<ValidationResult>}
 *
 * @typedef {{ valid: true, warning?: string } | { valid: false, errors: ValidationError[] }} ValidationResult
 * @typedef {{ field: string, message: string }} ValidationError
 */
async function validate(schemaName, data) {
  const ajv = await getAjv();

  if (ajv === false) {
    return {
      valid: true,
      warning: 'ajv not installed, validation skipped',
    };
  }

  // Load schema (may throw if file is missing).
  const schema = loadSchema(schemaName);

  // Compile & cache the validator.
  if (!validatorCache.has(schemaName)) {
    validatorCache.set(schemaName, ajv.compile(schema));
  }
  const validateFn = validatorCache.get(schemaName);

  const ok = validateFn(data);
  if (ok) {
    return { valid: true };
  }

  const errors = (validateFn.errors ?? []).map((e) => ({
    field: e.instancePath || '(root)',
    message: e.message ?? 'unknown error',
  }));

  return { valid: false, errors };
}

/**
 * Synchronous convenience wrapper.
 * Falls back gracefully when Ajv hasn't been initialised yet (returns a
 * "pending" warning). Prefer the async `validate()` in most situations.
 *
 * NOTE: This wrapper cannot actually load Ajv synchronously — it uses the
 * cached compiled validator if one already exists from a prior async call,
 * otherwise it skips validation with a warning.
 *
 * @param {string} schemaName
 * @param {unknown} data
 * @returns {ValidationResult}
 */
function validateSync(schemaName, data) {
  if (_ajv === null || _ajv === false) {
    return {
      valid: true,
      warning: _ajv === false
        ? 'ajv not installed, validation skipped'
        : 'ajv not yet initialised — call validate() (async) first',
    };
  }

  const schema = loadSchema(schemaName);

  if (!validatorCache.has(schemaName)) {
    validatorCache.set(schemaName, _ajv.compile(schema));
  }
  const validateFn = validatorCache.get(schemaName);

  const ok = validateFn(data);
  if (ok) return { valid: true };

  const errors = (validateFn.errors ?? []).map((e) => ({
    field: e.instancePath || '(root)',
    message: e.message ?? 'unknown error',
  }));

  return { valid: false, errors };
}

/**
 * Clear all internal caches (useful in tests).
 */
function clearCaches() {
  schemaCache.clear();
  validatorCache.clear();
  _ajv = null;
}

export { validate, validateSync, clearCaches, loadSchema };
