import {
  CUSTOM_THEME_SCHEMA_VERSION,
  MAX_CUSTOM_THEMES,
  normalizeCustomThemeStore,
  validateCustomThemePreset,
} from './theme-presets.js';

export const CUSTOM_THEME_EXPORT_FORMAT = 'qqj-custom-themes';
// 单个主题最多约 3 KB（12 个 ≤200 字符的颜色值），50 个主题远小于 1 MiB；超过即视为异常文件。
export const MAX_THEME_IMPORT_BYTES = 1024 * 1024;

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
  return 'qqj-themes-' + String(date.getFullYear()).padStart(4, '0') + pad(date.getMonth() + 1) + pad(date.getDate()) + '.json';
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
  if (typeof jsonText === 'string' && jsonText.length > MAX_THEME_IMPORT_BYTES) {
    throw transferError('IMPORT_TOO_LARGE', '主题文件过大，无法导入。');
  }
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
  let skippedCount = 0, limitReached = false;

  for (const [index, candidate] of payload.items.entries()) {
    if (current.items.length + imported.length >= MAX_CUSTOM_THEMES) {
      // 主题库已满：其余项目不再校验，直接计入跳过，避免超大数组拖慢导入。
      limitReached = true;
      skippedCount += payload.items.length - index;
      break;
    }
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
    limitReached,
  };
}


export function downloadCustomThemesFile({
  customThemeStore,
  documentRef = globalThis.document,
  windowRef = documentRef?.defaultView ?? globalThis,
  now = new Date(),
} = {}) {
  const BlobCtor = windowRef?.Blob ?? globalThis.Blob;
  const urlApi = windowRef?.URL ?? globalThis.URL;
  if (
    typeof BlobCtor !== 'function'
    || typeof urlApi?.createObjectURL !== 'function'
    || typeof documentRef?.createElement !== 'function'
    || typeof documentRef?.body?.appendChild !== 'function'
  ) {
    throw new TypeError('当前浏览器不支持文件下载。');
  }

  const payload = createCustomThemesExport(customThemeStore, { now });
  const content = JSON.stringify(payload, null, 2) + '\n';
  const filename = createCustomThemesFilename(now);
  const blob = new BlobCtor([content], { type: 'application/json;charset=utf-8' });
  const objectUrl = urlApi.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;

  try {
    documentRef.body.appendChild(link);
    link.click();
  } catch (error) {
    try { urlApi.revokeObjectURL?.(objectUrl); } catch { /* browser cleanup */ }
    throw error;
  } finally {
    link.remove?.();
  }

  const revoke = () => {
    try { urlApi.revokeObjectURL?.(objectUrl); } catch { /* browser cleanup */ }
  };
  if (typeof windowRef?.setTimeout === 'function') windowRef.setTimeout(revoke, 0);
  else revoke();

  return { filename, exportedCount: payload.items.length };
}
