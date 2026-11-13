import {
  CUSTOM_THEME_SCHEMA_VERSION,
  normalizeCustomThemeStore,
  validateCustomThemePreset,
} from './theme-presets.js';

export const CUSTOM_THEME_EXPORT_FORMAT = 'qqj-custom-themes';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownKeysAllowed = (value, allowed) => Object.keys(value).every(key => allowed.has(key));
const PRESET_KEYS = new Set(['id', 'name', 'variables', 'createdAt', 'updatedAt']);
const PACKAGE_KEYS = new Set(['format', 'schemaVersion', 'exportedAt', 'items']);

function dateValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('主题导出日期无效。');
  return date;
}

export function createCustomThemesFilename(now = new Date()) {
  const date = dateValue(now);
  const pad = value => String(value).padStart(2, '0');
  return 'qqj-themes-' + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) + '.json';
}

export function createCustomThemesExport(customThemeStore, { now = new Date() } = {}) {
  const store = normalizeCustomThemeStore(customThemeStore);
  const items = store.items.map(item => validateCustomThemePreset(item));
  return {
    format: CUSTOM_THEME_EXPORT_FORMAT,
    schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
    exportedAt: dateValue(now).toISOString(),
    items,
  };
}

export function stringifyCustomThemesExport(customThemeStore, options = {}) {
  return JSON.stringify(createCustomThemesExport(customThemeStore, options), null, 2) + '\n';
}

function transferError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function uniqueImportedId(sourceId, usedIds) {
  for (let sequence = 1; sequence < 10000; sequence += 1) {
    const suffix = sequence === 1 ? '-imported' : '-imported-' + sequence;
    const candidate = sourceId.slice(0, 100 - suffix.length) + suffix;
    if (!usedIds.has(candidate)) return candidate;
  }
  throw transferError('IMPORT_ID_EXHAUSTED', '无法为冲突主题生成新的 ID。');
}

/**
 * Parse, validate, and merge an export package without changing the active preset.
 * Invalid individual items are skipped; invalid package headers reject the file.
 */
export function importCustomThemesJson(jsonText, currentCustomThemeStore) {
  let payload;
  try {
    if (typeof jsonText !== 'string') throw new TypeError('主题文件内容必须是文本。');
    payload = JSON.parse(jsonText);
  } catch {
    throw transferError('INVALID_JSON', '文件不是有效的 JSON。请检查文件内容后重试。');
  }

  if (
    !isRecord(payload)
    || !ownKeysAllowed(payload, PACKAGE_KEYS)
    || payload.format !== CUSTOM_THEME_EXPORT_FORMAT
    || payload.schemaVersion !== CUSTOM_THEME_SCHEMA_VERSION
    || typeof payload.exportedAt !== 'string'
    || !Number.isFinite(Date.parse(payload.exportedAt))
    || !Array.isArray(payload.items)
  ) {
    throw transferError('INVALID_PACKAGE', '主题文件格式或版本不受支持，无法导入。');
  }

  const current = normalizeCustomThemeStore(currentCustomThemeStore);
  const usedIds = new Set(current.items.map(item => item.id));
  const imported = [];
  let skippedCount = 0;

  for (const candidate of payload.items) {
    try {
      // Run the stage-1 validator for every item before accepting anything from it.
      const validated = validateCustomThemePreset(candidate);
      // Unknown URL / script / CSS metadata is never carried into the theme library.
      if (!isRecord(candidate) || !ownKeysAllowed(candidate, PRESET_KEYS)) {
        throw new TypeError('主题包含不支持的字段。');
      }

      // Imported themes use the computed foreground mode so the accent text stays readable.
      const importPreset = {
        ...validated,
        variables: { ...validated.variables, onPrimary: 'auto' },
      };
      const id = usedIds.has(importPreset.id) ? uniqueImportedId(importPreset.id, usedIds) : importPreset.id;
      const safePreset = validateCustomThemePreset({ ...importPreset, id }, { existingIds: [...usedIds] });
      imported.push(safePreset);
      usedIds.add(safePreset.id);
    } catch {
      skippedCount += 1;
    }
  }

  return {
    customThemeStore: {
      schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
      activePresetId: current.activePresetId,
      items: [...current.items, ...imported],
    },
    importedCount: imported.length,
    skippedCount,
  };
}
