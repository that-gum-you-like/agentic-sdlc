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
 *   // Without Ajv the built-in draft-07-subset validator produces the same
 *   // shaped verdicts (engine: 'builtin-fallback') — validation NEVER skips
 *   // (fail-closed, REQ-H1).
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

// ── Built-in fallback validator (fail-closed, zero-dep) ──────────────────────
//
// The framework ships with zero npm dependencies, so Ajv is normally absent.
// The old behavior returned { valid: true } in that case — a fail-OPEN gate
// that never rejected anything. This built-in validator covers the JSON
// Schema draft-07 subset our schemas in agents/schemas/ actually use
// (type, required, properties, additionalProperties, enum, pattern,
// minimum/maximum, items, format: date-time) so validation always has teeth.

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeOf(value);
  if (expected === 'integer') return actual === 'number' && Number.isInteger(value);
  if (expected === 'number') return actual === 'number';
  return actual === expected;
}

function miniValidate(schema, data, path = '(root)', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;

  // type (string or array of strings)
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(t => typeMatches(t, data))) {
      errors.push({ field: path, message: `must be ${types.join(' or ')} (got ${typeOf(data)})` });
      return errors; // deeper checks are meaningless on a type mismatch
    }
  }

  // enum (Ajv-compatible message wording)
  if (Array.isArray(schema.enum) && !schema.enum.some(v => v === data)) {
    errors.push({ field: path, message: `must be equal to one of the allowed values (${schema.enum.join(', ')})` });
  }

  if (typeOf(data) === 'string') {
    if (schema.pattern && !(new RegExp(schema.pattern).test(data))) {
      errors.push({ field: path, message: `must match pattern ${schema.pattern}` });
    }
    if (schema.format === 'date-time' && !DATE_TIME_RE.test(data)) {
      errors.push({ field: path, message: 'must be an ISO 8601 date-time' });
    }
  }

  if (typeOf(data) === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({ field: path, message: `must be >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({ field: path, message: `must be <= ${schema.maximum}` });
    }
  }

  if (typeOf(data) === 'object') {
    for (const req of schema.required || []) {
      if (!(req in data)) {
        errors.push({ field: `${path}/${req}`, message: 'is required' });
      }
    }
    const props = schema.properties || {};
    for (const [key, value] of Object.entries(data)) {
      if (key in props) {
        miniValidate(props[key], value, `${path}/${key}`, errors);
      } else if (schema.additionalProperties === false) {
        // Ajv-compatible message wording
        errors.push({ field: `${path}/${key}`, message: `must NOT have additional properties (${key})` });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        miniValidate(schema.additionalProperties, value, `${path}/${key}`, errors);
      }
    }
  }

  if (typeOf(data) === 'array' && schema.items) {
    data.forEach((item, i) => miniValidate(schema.items, item, `${path}/${i}`, errors));
  }

  return errors;
}

function builtinValidate(schemaName, data) {
  const schema = loadSchema(schemaName);
  const errors = miniValidate(schema, data);
  if (errors.length > 0) {
    return { valid: false, errors, engine: 'builtin-fallback' };
  }
  return { valid: true, engine: 'builtin-fallback' };
}

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
    // Fail CLOSED: without Ajv we still validate with the built-in
    // subset validator — never return an unconditional { valid: true }.
    return builtinValidate(schemaName, data);
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
    // Fail CLOSED: the built-in validator is synchronous, so the sync path
    // always produces a real verdict even when Ajv is absent/uninitialised.
    return builtinValidate(schemaName, data);
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

export { validate, validateSync, clearCaches, loadSchema, miniValidate, builtinValidate };
