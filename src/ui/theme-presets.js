/**
 * Custom appearance theme data model.
 *
 * A preset stores a complete snapshot of the palette variables consumed by
 * appearance.js. Keeping the allowlist here prevents arbitrary CSS properties
 * or executable CSS values from entering the theme pipeline.
 */
export const CUSTOM_THEME_SCHEMA_VERSION = 1;

export const CUSTOM_THEME_VARIABLES = Object.freeze([
  'paper', 'panel', 'ink', 'soft', 'faint', 'line', 'thread',
  'crimson', 'knot', 'onPrimary', 'blue', 'success',
]);

const VARIABLE_SET = new Set(CUSTOM_THEME_VARIABLES);
const EMPTY_STORE = Object.freeze({
  schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
  activePresetId: null,
  items: Object.freeze([]),
});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanText = value => typeof value === 'string' ? value.trim() : '';

function isSafeColor(value) {
  if (typeof value !== 'string') return false;
  const color = value.trim();
  if (!color || color.length > 128) return false;
  if (/^#[\da-f]{3,4}(?:[\da-f]{2}){0,2}$/iu.test(color)) return true;
  // Numeric-only functional color syntax: no url(), var(), declarations or delimiters.
  return /^(?:rgb|rgba|hsl|hsla)\(\s*[-+\d.%\s,/]+\)$/iu.test(color);
}

function normalizeTimestamp(value) {
  const timestamp = cleanText(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : '';
}

export function createDefaultCustomThemeStore() {
  return { schemaVersion: CUSTOM_THEME_SCHEMA_VERSION, activePresetId: null, items: [] };
}

export function createCustomThemeId(now = Date.now, random = Math.random) {
  return `theme-${now().toString(36)}-${random().toString(36).slice(2, 9)}`;
}

/**
 * Strictly validate one preset. Unknown/missing variables and duplicate IDs
 * are rejected instead of silently replacing an existing theme.
 */
export function validateCustomThemePreset(value, { existingIds = [] } = {}) {
  if (!record(value)) throw new TypeError('自定义主题必须是对象。');
  const id = cleanText(value.id);
  const name = cleanText(value.name);
  if (!id || id.length > 100) throw new TypeError('自定义主题 ID 无效。');
  if (!name || name.length > 80) throw new TypeError('自定义主题名称无效。');
  if (existingIds.includes(id)) throw new TypeError('自定义主题 ID 重复，不能覆盖已有主题。');
  if (!record(value.variables)) throw new TypeError('自定义主题变量必须是对象。');

  const unknown = Object.keys(value.variables).filter(key => !VARIABLE_SET.has(key));
  if (unknown.length) throw new TypeError(`自定义主题包含不支持的变量：${unknown.join(', ')}。`);

  const variables = {};
  for (const key of CUSTOM_THEME_VARIABLES) {
    if (!own(value.variables, key) || !isSafeColor(value.variables[key])) {
      throw new TypeError(`自定义主题变量 ${key} 缺失或颜色值无效。`);
    }
    variables[key] = value.variables[key].trim();
  }

  return {
    id,
    name,
    variables,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
}

/**
 * Normalize persisted settings defensively. Invalid records are discarded;
 * the first occurrence of a duplicate ID wins and is never overwritten.
 */
export function normalizeCustomThemeStore(value) {
  if (!record(value) || value.schemaVersion !== CUSTOM_THEME_SCHEMA_VERSION || !Array.isArray(value.items)) {
    return createDefaultCustomThemeStore();
  }

  const items = [];
  const ids = new Set();
  for (const candidate of value.items) {
    const id = cleanText(candidate?.id);
    if (!id || ids.has(id)) continue;
    try {
      const preset = validateCustomThemePreset(candidate, { existingIds: [...ids] });
      items.push(preset);
      ids.add(preset.id);
    } catch {
      // Ignore malformed persisted records without blocking other valid themes.
    }
  }

  const requestedActiveId = cleanText(value.activePresetId);
  return {
    schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
    activePresetId: ids.has(requestedActiveId) ? requestedActiveId : null,
    items,
  };
}
