/**
 * Custom appearance theme data model.
 *
 * A preset stores a complete snapshot of the palette variables consumed by
 * appearance.js. Keeping the allowlist here prevents arbitrary CSS properties
 * or executable CSS values from entering the theme pipeline.
 */
export const CUSTOM_THEME_SCHEMA_VERSION = 1;
// 主题库写入 extension_settings 并随酒馆设置整体保存；设置上限防止导入或损坏数据撑大设置文件。
export const MAX_CUSTOM_THEMES = 50;

export const CUSTOM_THEME_VARIABLES = Object.freeze([
  'paper', 'panel', 'ink', 'soft', 'faint', 'line', 'thread',
  'crimson', 'knot', 'onPrimary', 'blue', 'success',
]);

const VARIABLE_SET = new Set(CUSTOM_THEME_VARIABLES);

// 12 个字段的“跟随宿主”映射在这里集中定义：动态主题模板、编辑器按钮、运行时检测都读这一份。
// crimson / blue / success 永远是静态 HEX，onPrimary 只能是 auto 或静态颜色，因此都不在映射里。
export const THEME_FOLLOW_VARIABLES = Object.freeze({
  paper: '--SmartThemeBlurTintColor', panel: '--SmartThemeChatTintColor',
  ink: '--SmartThemeBodyColor', soft: '--SmartThemeEmColor', faint: '--SmartThemeEmColor',
  line: '--SmartThemeBorderColor', thread: '--SmartThemeBorderColor', knot: '--SmartThemeQuoteColor',
});
export const THEME_STATIC_SEMANTIC_FIELDS = Object.freeze(['crimson', 'blue', 'success']);
const STATIC_SEMANTIC_SET = new Set(THEME_STATIC_SEMANTIC_FIELDS);
const EMPTY_STORE = Object.freeze({
  schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
  activePresetId: null,
  items: Object.freeze([]),
});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const cleanText = value => typeof value === 'string' ? value.trim() : '';

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu;
const RGB_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/u;
const HSL_HUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:deg|rad|turn)?$/iu;
const HSL_PERCENT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/u;
const ALPHA_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/u;
const VARIABLE_NAME = /^--(?:SmartTheme[A-Za-z\d_-]*|qqj-[A-Za-z\d_-]+)$/u;

// These QQJ aliases are derived from palette fields inside the Shadow DOMs.
const QQJ_PALETTE_ALIASES = new Map([
  ['--qqj-color-text', 'ink'], ['--qqj-color-muted', 'soft'], ['--qqj-inline-soft', 'soft'],
  ['--qqj-color-accent', 'knot'], ['--qqj-inline-knot', 'knot'],
  ['--qqj-color-danger', 'crimson'], ['--qqj-inline-error', 'crimson'],
  ['--qqj-color-success', 'success'], ['--qqj-inline-success', 'success'],
  ['--qqj-color-surface', 'panel'], ['--qqj-color-line', 'line'], ['--qqj-inline-line', 'line'],
  ['--qqj-color-on-accent', 'onPrimary'],
  ['--qqj-dialog-sheet', 'panel'], ['--qqj-dialog-surface', 'paper'],
  ['--qqj-dialog-ink', 'ink'], ['--qqj-dialog-soft', 'soft'], ['--qqj-dialog-divider', 'line'],
  ['--qqj-dialog-primary', 'knot'], ['--qqj-dialog-danger', 'crimson'],
  ['--qqj-dialog-success', 'success'], ['--qqj-dialog-blue', 'blue'], ['--qqj-dialog-on-primary', 'onPrimary'],
  ['--qqj-fab-primary', 'knot'], ['--qqj-fab-ink', 'ink'], ['--qqj-fab-surface', 'panel'],
]);

function splitTopLevel(value, delimiter = ',') {
  const result = [];
  let depth = 0, start = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1;
    else if (value[i] === ')') { depth -= 1; if (depth < 0) return null; }
    else if (value[i] === delimiter && depth === 0) {
      result.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  result.push(value.slice(start).trim());
  return result;
}

function getFunctionBody(value, name) {
  const match = new RegExp('^' + name + '\\s*\\(', 'iu').exec(value);
  if (!match || !value.endsWith(')')) return null;
  const body = value.slice(match[0].length, -1);
  let depth = 0;
  for (const character of body) {
    if (character === '(') depth += 1;
    else if (character === ')') { depth -= 1; if (depth < 0) return null; }
  }
  return depth === 0 ? body : null;
}

function isStaticColor(value) {
  if (typeof value !== 'string') return false;
  const color = value.trim();
  if (!color || color.length > 200 || /[;{}]|\/\*|\*\//u.test(color)) return false;
  if (HEX_COLOR.test(color)) return true;

  const match = /^(rgb|rgba|hsl|hsla)\((.*)\)$/iu.exec(color);
  if (!match) return false;
  const fn = match[1].toLowerCase(), body = match[2].trim();
  const slash = splitTopLevel(body, '/');
  if (!slash || slash.length > 2) return false;
  const source = slash[0], comma = source.includes(',');
  const channels = comma ? splitTopLevel(source, ',') : source.split(/\s+/u);
  if (!channels || channels.some(item => !item)) return false;
  let alpha = slash[1] ?? null;
  const alphaFunction = fn === 'rgba' || fn === 'hsla';
  if (channels.length === 4) {
    if (!comma || alpha !== null || !alphaFunction) return false;
    alpha = channels.pop();
  }
  if (channels.length !== 3 || (alphaFunction && alpha === null)) return false;
  if (fn === 'rgb' || fn === 'rgba') {
    if (!channels.every(item => RGB_NUMBER.test(item))) return false;
  } else if (!HSL_HUE.test(channels[0]) || !HSL_PERCENT.test(channels[1]) || !HSL_PERCENT.test(channels[2])) {
    return false;
  }
  return alpha === null || ALPHA_NUMBER.test(alpha);
}

function parseVar(value) {
  const body = getFunctionBody(value, 'var');
  if (body === null) return null;
  const parts = splitTopLevel(body);
  if (!parts || parts.length !== 2 || !VARIABLE_NAME.test(parts[0])) return null;
  return { name: parts[0], fallback: parts[1] };
}

function validateVarFallback(value, references) {
  const candidate = value.trim();
  if (isStaticColor(candidate)) return true;
  const variable = parseVar(candidate);
  if (!variable || references.has(variable.name)) return false;
  const next = new Set(references);
  next.add(variable.name);
  return validateVarFallback(variable.fallback, next);
}

function validateColorExpression(value, references = new Set()) {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();
  if (!candidate || candidate.length > 200 || /[;{}]|\/\*|\*\//u.test(candidate)) return false;
  if (isStaticColor(candidate)) return true;

  const variable = parseVar(candidate);
  if (variable) {
    if (references.has(variable.name) || !variable.fallback) return false;
    const next = new Set(references);
    next.add(variable.name);
    return validateVarFallback(variable.fallback, next);
  }

  const mixBody = getFunctionBody(candidate, 'color-mix');
  if (mixBody === null) return false;
  const parts = splitTopLevel(mixBody);
  if (!parts || parts.length !== 3 || parts[0].toLowerCase() !== 'in srgb') return false;
  const weighted = /^(.+?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/iu.exec(parts[1]);
  if (!weighted) return false;
  const percentage = Number(weighted[2]);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return false;
  return validateColorExpression(weighted[1].trim(), new Set(references))
    && validateColorExpression(parts[2], new Set(references));
}

function findThemeReferenceCycles(variables) {
  const graph = new Map();
  for (const [field, value] of Object.entries(variables)) {
    const edges = new Set();
    for (const match of value.matchAll(/var\(\s*(--[A-Za-z\d_-]+)/giu)) {
      const target = QQJ_PALETTE_ALIASES.get(match[1]);
      if (target && Object.prototype.hasOwnProperty.call(variables, target)) edges.add(target);
    }
    graph.set(field, edges);
  }
  const visited = new Set(), stack = [], cyclic = new Set();
  const visit = field => {
    const index = stack.indexOf(field);
    if (index >= 0) { for (const item of stack.slice(index)) cyclic.add(item); return; }
    if (visited.has(field)) return;
    stack.push(field);
    for (const target of graph.get(field) ?? []) visit(target);
    stack.pop();
    visited.add(field);
  };
  for (const field of graph.keys()) visit(field);
  return cyclic;
}

export function isSafeCustomThemeValue(value) {
  return validateColorExpression(value);
}

// 值依赖宿主主题变量（含嵌套在 color-mix 里的引用）。运行时据此决定宿主变化时是否需要重新解析。
export function isHostFollowingValue(value) {
  return typeof value === 'string' && /var\(\s*--SmartTheme/iu.test(value);
}
// 值本身就是一个直接的 var(--SmartTheme…, 回退色)，编辑器的“跟随宿主 / 改为静态”按钮据此切换。
export function isDirectHostVariable(value) {
  return typeof value === 'string' && /^var\(\s*--SmartTheme/iu.test(value);
}
export function hasHostFollowingVariables(variables) {
  return Object.values(variables ?? {}).some(isHostFollowingValue);
}

/** 单个字段的取值规则；校验、规范化与运行时解析共用，避免三处各写一份。 */
export function isValidThemeFieldValue(key, raw) {
  if (key === 'onPrimary') return raw === 'auto' || isStaticColor(raw);
  if (STATIC_SEMANTIC_SET.has(key)) return isSafeHexThemeColor(raw);
  return validateColorExpression(raw);
}

export function isSafeStaticThemeColor(value) {
  return isStaticColor(value);
}

export function isSafeHexThemeColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value.trim());
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
  const id = cleanText(value.id), name = cleanText(value.name);
  if (!id || id.length > 100) throw new TypeError('自定义主题 ID 无效。');
  if (!name || name.length > 80) throw new TypeError('自定义主题名称无效。');
  if (existingIds.includes(id)) throw new TypeError('自定义主题 ID 重复，不能覆盖已有主题。');
  if (!record(value.variables)) throw new TypeError('自定义主题变量必须是对象。');
  const unknown = Object.keys(value.variables).filter(key => !VARIABLE_SET.has(key));
  if (unknown.length) throw new TypeError('自定义主题包含不支持的变量：' + unknown.join(', ') + '。');

  const variables = {};
  for (const key of CUSTOM_THEME_VARIABLES) {
    if (!own(value.variables, key)) throw new TypeError('自定义主题变量 ' + key + ' 缺失或颜色值无效。');
    const raw = value.variables[key];
    if (!isValidThemeFieldValue(key, raw)) {
      throw new TypeError(STATIC_SEMANTIC_SET.has(key) ? '自定义主题变量 ' + key + ' 必须是静态 HEX 颜色。' : '自定义主题变量 ' + key + ' 缺失或颜色值无效。');
    }
    variables[key] = raw.trim();
  }
  if (findThemeReferenceCycles(variables).size) throw new TypeError('自定义主题包含循环引用。');
  return {
    id, name, variables,
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
  const items = [], ids = new Set();
  for (const candidate of value.items) {
    if (items.length >= MAX_CUSTOM_THEMES) break;
    if (!record(candidate) || !record(candidate.variables)) continue;
    const id = cleanText(candidate.id), name = cleanText(candidate.name);
    if (!id || id.length > 100 || !name || name.length > 80 || ids.has(id)) continue;
    const variables = {};
    for (const key of CUSTOM_THEME_VARIABLES) {
      if (!own(candidate.variables, key)) continue;
      const raw = candidate.variables[key];
      if (isValidThemeFieldValue(key, raw)) variables[key] = raw.trim();
    }
    for (const key of findThemeReferenceCycles(variables)) delete variables[key];
    items.push({
      id, name, variables,
      createdAt: normalizeTimestamp(candidate.createdAt),
      updatedAt: normalizeTimestamp(candidate.updatedAt),
    });
    ids.add(id);
  }
  const requestedActiveId = cleanText(value.activePresetId);
  return {
    schemaVersion: CUSTOM_THEME_SCHEMA_VERSION,
    activePresetId: ids.has(requestedActiveId) ? requestedActiveId : null,
    items,
  };
}


function staticVariablesFromPalette(palette) {
  if (!record(palette)) throw new TypeError('当前主题 palette 无效。');
  const variables = {};
  for (const key of CUSTOM_THEME_VARIABLES) {
    const color = cleanText(palette[key]);
    if (key === 'onPrimary' && color === 'auto') { variables[key] = '#fff'; continue; }
    const valid = STATIC_SEMANTIC_SET.has(key) ? isSafeHexThemeColor(color) : isStaticColor(color);
    if (!valid) throw new TypeError('当前主题变量 ' + key + ' 不是可保存的静态颜色。');
    variables[key] = color;
  }
  return variables;
}

function timestampFrom(now) {
  const value = typeof now === 'function' ? now() : now ?? Date.now();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function makePreset({ name, variables, id, now = Date.now, random = Math.random } = {}) {
  const timestamp = timestampFrom(now);
  return validateCustomThemePreset({
    id: cleanText(id) || createCustomThemeId(now, random),
    name, variables, createdAt: timestamp, updatedAt: timestamp,
  });
}

export function createStaticCustomThemePreset(options = {}) {
  return makePreset({ ...options, variables: staticVariablesFromPalette(options.palette) });
}

export function createDynamicCustomThemePreset(options = {}) {
  const base = staticVariablesFromPalette(options.palette);
  const variables = { ...base, onPrimary: 'auto' };
  for (const [key, hostVariable] of Object.entries(THEME_FOLLOW_VARIABLES)) {
    variables[key] = 'var(' + hostVariable + ', ' + base[key] + ')';
  }
  return makePreset({ ...options, variables });
}
