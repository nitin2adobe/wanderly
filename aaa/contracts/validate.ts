import common from './v1/common.schema.json' with { type: 'json' };
import canonicalSignal from './v1/canonical-signal.schema.json' with { type: 'json' };
import journeyState from './v1/journey-state.schema.json' with { type: 'json' };
import siteProfile from './v1/site-profile.schema.json' with { type: 'json' };
import starterRequest from './v1/starter-request.schema.json' with { type: 'json' };
import starterResult from './v1/starter-result.schema.json' with { type: 'json' };
import type { CanonicalSignal, JourneyState, SiteProfile, StarterRequest, StarterResult } from './types.ts';

// Dependency-free validator for the JSON Schema 2020-12 subset used by the AAA v1 contracts.
// Unsupported keywords throw, so a schema can never be silently under-validated.

type Schema = boolean | { [keyword: string]: unknown };

export type ContractDiagnostic = { path: string; message: string };
export type ContractValidation<T> = { valid: true; value: T } | { valid: false; errors: ContractDiagnostic[] };

export type ContractTypes = {
  CanonicalSignal: CanonicalSignal;
  JourneyState: JourneyState;
  SiteProfile: SiteProfile;
  StarterRequest: StarterRequest;
  StarterResult: StarterResult;
};
export type ContractName = keyof ContractTypes;

export const contractSchemas = {
  CanonicalSignal: canonicalSignal,
  JourneyState: journeyState,
  SiteProfile: siteProfile,
  StarterRequest: starterRequest,
  StarterResult: starterResult,
} as const satisfies Record<ContractName, { $id: string }>;

export const allSchemas: readonly { $id: string }[] = [common, ...Object.values(contractSchemas)];

export const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', '$ref', '$defs', 'title', 'description',
  'type', 'const', 'enum', 'format',
  'minLength', 'maxLength', 'pattern', 'minimum',
  'properties', 'required', 'additionalProperties', 'propertyNames', 'minProperties',
  'items', 'minItems', 'maxItems', 'uniqueItems', 'contains', 'minContains', 'maxContains',
  'allOf', 'anyOf', 'if', 'then',
]);

const registry = new Map<string, Schema>(allSchemas.map(s => [s.$id, s as Schema]));
const patternCache = new Map<string, RegExp>();
const regex = (source: string) => {
  let r = patternCache.get(source);
  if (!r) patternCache.set(source, (r = new RegExp(source, 'u')));
  return r;
};

function resolveRef(ref: string, baseId: string): { schema: Schema; baseId: string } {
  const [docId, pointer = ''] = ref.split('#');
  const id = docId || baseId;
  let node: unknown = registry.get(id);
  if (node === undefined) throw new Error(`Unknown schema reference ${ref}`);
  for (const part of pointer.split('/').filter(Boolean)) node = (node as Record<string, unknown>)[part];
  if (node === undefined) throw new Error(`Unresolvable schema reference ${ref}`);
  return { schema: node as Schema, baseId: id };
}

const typeOf = (v: unknown) => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
const matchesType = (v: unknown, t: string) => t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeOf(v) === t;
const isObject = (v: unknown): v is Record<string, unknown> => typeOf(v) === 'object';
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/;
// Leap seconds (:60) are rejected; contract timestamps are machine-generated.
function isDateTime(value: string): boolean {
  const m = DATE_TIME.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const offsetOk = m[9] === undefined || (Number(m[9]) <= 23 && Number(m[10]) <= 59);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth && hour <= 23 && minute <= 59 && second <= 59 && offsetOk;
}

function check(schema: Schema, value: unknown, path: string, baseId: string, errors: ContractDiagnostic[]): void {
  if (schema === true) return;
  if (schema === false) { errors.push({ path, message: 'is not allowed' }); return; }
  for (const keyword of Object.keys(schema)) if (!SUPPORTED_KEYWORDS.has(keyword)) throw new Error(`Unsupported schema keyword "${keyword}" at ${path}`);
  const s = schema as Record<string, any>;
  const fail = (message: string, at = path) => errors.push({ path: at, message });

  if (s.$ref) { const r = resolveRef(s.$ref, baseId); check(r.schema, value, path, r.baseId, errors); }
  if (s.type !== undefined) {
    const types: string[] = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some(t => matchesType(value, t))) { fail(`must be ${types.join(' or ')}`); return; }
  }
  if ('const' in s && !equal(value, s.const)) fail(`must equal ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.some((e: unknown) => equal(e, value))) fail(`must be one of ${s.enum.map((e: unknown) => JSON.stringify(e)).join(', ')}`);

  if (typeof value === 'string') {
    if (s.minLength !== undefined && [...value].length < s.minLength) fail(`must have at least ${s.minLength} characters`);
    if (s.maxLength !== undefined && [...value].length > s.maxLength) fail(`must have at most ${s.maxLength} characters`);
    if (s.pattern && !regex(s.pattern).test(value)) fail(`must match ${s.pattern}`);
    if (s.format === 'date-time' && !isDateTime(value)) fail('must be a valid date-time');
  }
  if (typeof value === 'number' && s.minimum !== undefined && value < s.minimum) fail(`must be >= ${s.minimum}`);

  if (isObject(value)) {
    const keys = Object.keys(value);
    for (const key of s.required ?? []) if (!hasOwn(value, key)) fail(`is missing required property "${key}"`);
    if (s.minProperties !== undefined && keys.length < s.minProperties) fail(`must have at least ${s.minProperties} properties`);
    for (const key of keys) {
      const at = `${path}/${key}`;
      if (s.propertyNames) check(s.propertyNames, key, `${at} (name)`, baseId, errors);
      if (s.properties && hasOwn(s.properties, key)) check(s.properties[key], value[key], at, baseId, errors);
      else if (s.additionalProperties === false) fail('is not an allowed property', at);
      else if (isObject(s.additionalProperties)) check(s.additionalProperties, value[key], at, baseId, errors);
    }
  }

  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) fail(`must have at least ${s.minItems} items`);
    if (s.maxItems !== undefined && value.length > s.maxItems) fail(`must have at most ${s.maxItems} items`);
    if (s.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) fail('must not contain duplicates');
    if (s.items) value.forEach((item, i) => check(s.items, item, `${path}/${i}`, baseId, errors));
    if (s.contains) {
      const matches = value.filter(item => passes(s.contains, item, baseId)).length;
      const min = s.minContains ?? 1;
      if (matches < min) fail(`must contain at least ${min} matching item(s)`);
      if (s.maxContains !== undefined && matches > s.maxContains) fail(`must contain at most ${s.maxContains} matching item(s)`);
    }
  }

  for (const sub of s.allOf ?? []) check(sub, value, path, baseId, errors);
  if (s.anyOf && !s.anyOf.some((sub: Schema) => passes(sub, value, baseId))) fail('does not match any allowed shape');
  if (s.if !== undefined && s.then !== undefined && passes(s.if, value, baseId)) check(s.then, value, path, baseId, errors);
}

const passes = (schema: Schema, value: unknown, baseId: string) => {
  const errors: ContractDiagnostic[] = [];
  check(schema, value, '', baseId, errors);
  return errors.length === 0;
};

export function validateContract<N extends ContractName>(name: N, value: unknown): ContractValidation<ContractTypes[N]> {
  const schema = contractSchemas[name];
  const errors: ContractDiagnostic[] = [];
  check(schema as Schema, value, '', schema.$id, errors);
  return errors.length ? { valid: false, errors: errors.map(e => ({ ...e, path: e.path || '/' })) } : { valid: true, value: value as ContractTypes[N] };
}
