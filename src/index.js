import Schema from '@deepseek-ai/schemastery'
import { createReadStream, existsSync, lstatSync, readdirSync, realpathSync, statSync, unlinkSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

export const name = 'dsh-columbina-theme'

/** Profile entry id this bundle's patch inserts; also the settings form namespace. */
export const SETTINGS_NS = 'dsh-columbina-theme'

/** File extension → content type for preset images. */
const PRESET_TYPES = Object.freeze({
  svg: 'image/svg+xml; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
})

/** Raster preset extensions (SVG scales natively and needs no thumbnail). */
const RASTER_FILE_RE = /\.(png|jpe?g|webp|gif)$/i

/** Source images larger than this get a grid preview thumbnail. */
const THUMB_MAX_SOURCE_BYTES = 512 * 1024
/** Preview thumbnail width (2x the ~200px grid swatch for retina). */
const THUMB_WIDTH = 640
const THUMB_EXT = 'jpg'

const PRESET_FILE_RE = /^([a-zA-Z0-9_-]+)\.(svg|png|jpe?g|webp|gif)$/

/** Package asset directory (this file's ../assets/backgrounds). */
const ASSETS_DIR = fileURLToPath(new URL('../assets/backgrounds/', import.meta.url))

/** Lazy sharp loader: thumbnails degrade gracefully when sharp is unavailable. */
let sharpPromise
function getSharp() {
  if (sharpPromise === undefined) {
    sharpPromise = import('sharp')
      .then((mod) => mod.default)
      .catch(() => null)
  }
  return sharpPromise
}

/** Thumbnail URL for a preset, or null when the source is small/vector. */
function presetThumbUrl(preset) {
  if (!RASTER_FILE_RE.test(preset.file)) return null
  try {
    if (statSync(join(ASSETS_DIR, preset.file)).size <= THUMB_MAX_SOURCE_BYTES) return null
  } catch {
    return null
  }
  return `${THUMBS_PREFIX}${preset.id}.${THUMB_EXT}`
}

/**
 * Scan the preset asset directory. Every image file in it becomes a preset
 * (id = filename stem), so adding a background is "drop a file, restart".
 * Re-scanned per call: files added mid-session appear on the next request.
 * @returns preset entries { id, file, type, thumb } in stable order.
 */
export function listPresets() {
  const found = []
  try {
    for (const entry of readdirSync(ASSETS_DIR)) {
      const match = PRESET_FILE_RE.exec(entry)
      if (!match) continue
      const preset = { id: match[1], file: entry, type: PRESET_TYPES[match[2]] }
      preset.thumb = presetThumbUrl(preset)
      found.push(preset)
    }
  } catch {
    // Asset dir missing (unlikely) — treat as empty.
  }
  found.sort((a, b) => a.id.localeCompare(b.id))
  return found
}

export const CONFIG_ENDPOINT = '/plugins/dsh-columbina-theme/config'
export const ASSETS_PREFIX = '/plugins/dsh-columbina-theme/assets/'
export const THUMBS_PREFIX = '/plugins/dsh-columbina-theme/thumbs/'
export const CUSTOM_PREFIX = '/plugins/dsh-columbina-theme/custom/'
export const UPLOAD_ENDPOINT = '/plugins/dsh-columbina-theme/background'

/** Content-type → stored extension for user-uploaded backgrounds. */
const UPLOAD_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
})

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

/**
 * Mark one preference field live-editable. DSH 0.2 derives a plugin's settings
 * form from its exported `Config`: a field carrying `meta.volatile` is written
 * through the Loader's live-commit path instead of remounting the plugin, and
 * only volatile fields are writable from the settings surface. `volatile()`
 * returns a copy (`extra()`), so the marked schema must be assigned back.
 */
function live(schema) {
  return typeof schema.volatile === 'function' ? schema.volatile() : schema
}

export const Config = Schema.object({
  background: live(
    Schema.string()
      .description('背景：预设 id，或 custom:<扩展名>；空字符串 = 浅色/深色各用默认背景')
      .default(''),
  ),
  maskOpacity: live(
    Schema.number()
      .min(0)
      .max(1)
      .step(0.05)
      .default(0.45)
      .role('slider')
      .description('蒙版不透明度：0 = 原图效果，越高越不透明，100 = 完全覆盖为主题底色'),
  ),
  maskColor: live(
    Schema.string()
      .description('蒙版颜色（空字符串 = 跟随明暗配色的默认底色）')
      .default(''),
  ),
  inputColor: live(
    Schema.string()
      .description('输入框颜色（空字符串 = 跟随明暗配色的默认色；输入框固定 80% 不透明）')
      .default(''),
  ),
  sidebarColor: live(
    Schema.string()
      .description('侧边栏颜色（空字符串 = 跟随明暗配色的默认色；侧边栏始终不透明）')
      .default(''),
  ),
  fontColor: live(
    Schema.string()
      .description('字体颜色（空字符串 = 跟随明暗配色的默认色）')
      .default(''),
  ),
  activeTitle: live(
    Schema.boolean()
      .description('当前会话标题使用渐变高亮特效')
      .default(true),
  ),
}).description('哥伦比娅主题设置')

const defaults = Object.freeze({
  background: '',
  maskOpacity: 0.45,
  maskColor: '',
  inputColor: '',
  sidebarColor: '',
  fontColor: '',
  activeTitle: true,
})

/**
 * Per-scheme default values applied when the stored setting is empty:
 * light mode uses the columbina-1 background and the light palette; dark
 * mode uses columbina-2 with the author's dark palette. Switching modes
 * therefore swaps both the background and the color scheme.
 */
const SCHEME_DEFAULTS = {
  light: {
    background: 'columbina-1',
    maskColor: '',
    inputColor: '#c8d1fe',
    sidebarColor: '#e5eaff',
    fontColor: '#78007a',
  },
  dark: {
    background: 'columbina-2',
    maskColor: '',
    inputColor: '#140010',
    sidebarColor: '#140010',
    fontColor: '#acabf2',
  },
}

/** Resolve one setting for a color scheme: stored override, else scheme default. */
function schemeValue(field, config, scheme) {
  const stored = config[field]
  if (typeof stored === 'string' && stored.trim() !== '') return stored
  return SCHEME_DEFAULTS[scheme][field]
}

/**
 * Read one config field from either a plain settings value or a live fiber
 * config. DSH 0.2 wraps every `volatile` field in a cosmokit reference that
 * the Loader updates in place, so `.get()` yields the current value.
 */
function unwrapField(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

function publicConfig(config = {}) {
  const source = config ?? {}
  return {
    background: unwrapField(source.background) ?? defaults.background,
    maskOpacity: unwrapField(source.maskOpacity) ?? defaults.maskOpacity,
    maskColor: unwrapField(source.maskColor) ?? defaults.maskColor,
    inputColor: unwrapField(source.inputColor) ?? defaults.inputColor,
    sidebarColor: unwrapField(source.sidebarColor) ?? defaults.sidebarColor,
    fontColor: unwrapField(source.fontColor) ?? defaults.fontColor,
    activeTitle: unwrapField(source.activeTitle) ?? defaults.activeTitle,
  }
}

/** DSH home directory (profile home), used for the legacy settings import. */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * The Loader entry id of this plugin's own row. DSH 0.2 addresses settings
 * forms by the profile entry id, which is a mount choice rather than a package
 * property, so identify the row by package name plus fiber identity and fall
 * back to an enabled same-name row before the fiber is attached.
 */
function ownEntryId(ctx) {
  let fallback
  try {
    for (const entry of ctx.loader?.entries?.() ?? []) {
      const id = entry.options?.id
      if (entry.options?.name !== name || typeof id !== 'string' || id === '') continue
      if (entry.fiber === ctx.fiber) return id
      if (entry.disabled !== true && fallback === undefined) fallback = id
    }
  } catch {
    // A loader that does not expose its entries leaves the form unavailable.
  }
  return fallback
}

/**
 * Read this plugin's section out of the retired `settings.yaml`. Both names
 * are tried because the settings service renames the document before it
 * imports any section.
 */
async function readLegacySection(home) {
  const declared = new Set(Object.keys(Config.dict ?? {}))
  for (const fileName of ['settings.yaml.imported', 'settings.yaml']) {
    let text
    try {
      text = await readFile(join(home, fileName), 'utf8')
    } catch {
      continue
    }
    let document
    try {
      document = parseYaml(text)
    } catch {
      continue
    }
    if (document === null || typeof document !== 'object' || Array.isArray(document)) continue
    const section = document[SETTINGS_NS]
    if (section === null || typeof section !== 'object' || Array.isArray(section)) continue
    // Only fields the current schema declares: a form write validates every
    // key against the schema, so one retired key would reject the whole patch.
    const filtered = Object.fromEntries(Object.entries(section).filter(([key]) => declared.has(key)))
    if (Object.keys(filtered).length > 0) return filtered
  }
  return undefined
}

/**
 * Import the preferences a pre-0.2 release persisted in `settings.yaml` into
 * this row's settings form, once. Never overwrites values the user already
 * configured after the upgrade.
 */
async function importLegacySettings(ctx, settings, ns) {
  try {
    await ctx.loader?.await?.()
    const row = settings.describe?.().find((candidate) => candidate.ns === ns)
    const user = row?.user
    if (user !== null && typeof user === 'object' && Object.keys(user).length > 0) return
    const section = await readLegacySection(ctx.profileContext?.home ?? dshHome())
    if (section === undefined) return
    await settings.update(ns, section)
    ctx.logger?.info?.('dsh-columbina-theme: imported preferences from the retired settings.yaml')
  } catch (error) {
    ctx.logger?.warn?.('dsh-columbina-theme: legacy preference import failed')
    ctx.logger?.warn?.(error)
  }
}

/**
 * The plugin's configuration read/write face.
 *
 * DSH 0.2 derives settings from the row's exported `Config` schema
 * (`ctx.settings.describe/update`, addressed by the Loader entry id); the
 * pre-0.2 `ctx.settings.register` namespace service is kept as a fallback so
 * the same bundle still works on older hosts. Values are always returned as a
 * complete plain object.
 */
function createConfigStore(ctx, initial) {
  const fallback = publicConfig(initial)
  let read = () => fallback
  let write = async () => {
    throw new Error('the DSH settings service is not available in this deployment')
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => {
      const settings = settingsCtx.settings
      if (settings === null || typeof settings !== 'object') return

      // Pre-0.2 hosts keep the registrable settings namespace.
      if (typeof settings.register === 'function') {
        const scope = settings.register(SETTINGS_NS, Config, { base: fallback, applies: 'live' })
        read = () => publicConfig(scope.get())
        write = async (patch) => {
          await scope.update(patch)
        }
        return
      }

      if (typeof settings.describe !== 'function' || typeof settings.update !== 'function') return
      const ns = ownEntryId(ctx)
      if (ns === undefined) {
        ctx.logger?.warn?.('dsh-columbina-theme: no Loader entry for this package; settings stay read-only')
        return
      }

      // This plugin ships its own settings card, so opt out of the native
      // auto-form (otherwise Settings would render the same fields twice).
      if (typeof settings.configure === 'function') {
        settingsCtx.effect(
          () => settings.configure({ auto: false }, ctx.fiber),
          'dsh-columbina-theme: settings page policy',
        )
      }

      const descriptor = () => {
        try {
          return settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === ns)
        } catch {
          return undefined
        }
      }
      read = () => {
        const value = descriptor()?.value
        return publicConfig(value !== null && typeof value === 'object' ? value : fallback)
      }
      write = async (patch) => {
        const revision = descriptor()?.revision
        try {
          await settings.update(ns, patch, revision)
        } catch (error) {
          // A concurrent edit moved the revision: retry once without the
          // expected revision (last writer wins, as the old seam did).
          if (error?.code !== 'SETTINGS_CONFLICT') throw error
          await settings.update(ns, patch)
        }
      }
      void importLegacySettings(ctx, settings, ns)
    })
  }

  return {
    get: () => read(),
    update: (patch) => write(patch),
  }
}

/** Plugin-owned data directory under the DSH home (custom uploads). */
function dataDir() {
  return join(dshHome(), 'storages', 'dsh-columbina-theme')
}

/**
 * Resolve `name` inside `baseDir` and require its real path to stay inside
 * `baseDir` (symlink-safe). Returns the resolved real path, or null when the
 * file is missing or a planted symlink escapes the base directory.
 */
function containedPath(baseDir, name) {
  try {
    const real = realpathSync(join(baseDir, name))
    const base = realpathSync(baseDir)
    const prefix = base.endsWith(sep) ? base : base + sep
    if (real === base || real.startsWith(prefix)) return real
  } catch {
    // Missing or unresolvable — treat as not found.
  }
  return null
}

/** Remove a symlink at `file` (if any) so writes never traverse it. */
function unlinkIfSymlink(file) {
  try {
    if (lstatSync(file).isSymbolicLink()) unlinkSync(file)
  } catch {
    // Not present — nothing to do.
  }
}

function customFilePath(ext) {
  return join(dataDir(), `custom-bg.${ext}`)
}

function currentCustomUrl() {
  for (const ext of Object.values(UPLOAD_TYPES)) {
    if (existsSync(customFilePath(ext))) return `${CUSTOM_PREFIX}custom-bg.${ext}`
  }
  return null
}

function contentTypeFor(ext) {
  const table = {
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
  }
  return table[ext] ?? 'application/octet-stream'
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** Local-only guard shared by the config and upload endpoints. */
function localOnly(req, res) {
  if (!isLoopback(req.socket?.remoteAddress)) {
    jsonResponse(res, 403, { error: 'local access only' })
    return false
  }
  const origin = req.headers?.origin
  if (origin) {
    let originHost
    try {
      originHost = new URL(origin).host
    } catch {}
    if (!originHost || originHost !== req.headers.host) {
      jsonResponse(res, 403, { error: 'origin mismatch' })
      return false
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// Static theme layer (webServer.tapIndex seam)
//
// The host bakes a <style> with the background/mask layers and the surface
// translucency + label token overrides into every served index.html, so the
// theme is already applied at first paint — no flash, no dependency on the
// client bundle. The browser half then re-applies the same values dynamically
// through ctx.theme.overrideTokens (presenter writes them inline on <body>,
// which outranks these stylesheet rules) and by setting the --columbina-*
// custom properties inline on <html>.
// NOTE: the token value tables below mirror lib/client.js buildTokens() —
// keep both halves in sync when adjusting colors.
// ---------------------------------------------------------------------------

/**
 * Surface translucency tokens, per color scheme. The alpha follows the mask
 * setting (maskOpacity): 0 = surfaces fully transparent so the original
 * background shows pure; 100 = fully opaque (the mask then covers with the
 * theme base color). The sidebar and every elevated surface — settings panel,
 * menus, dialogs, cards, selectors (--dsw-specific-sidebar-fill,
 * --dsw-alias-bg-layer-*, bg-module-platform, selector, multi-select) — keep
 * their base opaque values so the busy background never leaks through them.
 * @param alpha - mask opacity in [0, 1].
 */
function surfaceTokens(maskAlpha, inputColor, sidebarColor) {
  const a = Math.min(1, Math.max(0, maskAlpha))
  const inputRgb = (scheme) => pickColor(inputColor, scheme.input)
  const sidebarRgb = (scheme) => pickColor(sidebarColor, scheme.sidebar)
  return {
    light: {
      '--dsw-alias-bg-base': `rgba(255, 255, 255, ${a})`,
      '--dsw-specific-input-major': `rgba(${inputRgb(LIGHT)}, 0.8)`,
      '--dsw-specific-tip': `rgba(245, 246, 247, ${a})`,
      '--dsw-specific-bubble': `rgba(237, 243, 254, ${a})`,
      '--dsw-specific-bubble-highlight': `rgba(211, 226, 255, ${a})`,
      '--dsw-specific-sidebar-fill': `rgb(${sidebarRgb(LIGHT)})`,
    },
    dark: {
      '--dsw-alias-bg-base': `rgba(21, 21, 23, ${a})`,
      '--dsw-specific-input-major': `rgba(${inputRgb(DARK)}, 0.8)`,
      '--dsw-specific-tip': `rgba(44, 44, 46, ${a})`,
      '--dsw-specific-bubble': `rgba(44, 44, 46, ${a})`,
      '--dsw-specific-bubble-highlight': `rgba(53, 54, 56, ${a})`,
      '--dsw-specific-sidebar-fill': `rgb(${sidebarRgb(DARK)})`,
    },
  }
}

/** Per-scheme color seats used by the surface/mask defaults. */
const LIGHT = { input: '255, 255, 255', sidebar: '249, 250, 251' }
const DARK = { input: '44, 44, 46', sidebar: '27, 27, 28' }

/**
 * Mask veil RGB per color scheme (the alpha rides the
 * --columbina-mask-alpha custom property): 0 = the original background,
 * 100 = fully covered by the current theme base color. A custom maskColor
 * overrides both schemes.
 */
const MASK_RGB = {
  light: '255, 255, 255',
  dark: '21, 21, 23',
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** A valid #rrggbb converted to 'r, g, b', or the scheme default fallback. */
function pickColor(value, fallback) {
  return typeof value === 'string' && HEX_RE.test(value) ? hexToRgbString(value) : fallback
}

/** '#rrggbb' → 'r, g, b' (for the --columbina-mask-rgb custom property). */
function hexToRgbString(hex) {
  const value = hex.replace('#', '')
  return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`
}

/** Mask RGB for one scheme, honoring a custom maskColor. */
function maskRgbString(maskColor, scheme) {
  return HEX_RE.test(maskColor) ? hexToRgbString(maskColor) : MASK_RGB[scheme]
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Label tokens for one resolved font color; empty → the scheme's built-in labels. */
function labelPair(fontColor, fallback) {
  const custom = HEX_RE.test(fontColor) ? fontColor : null
  if (custom) {
    return {
      '--dsw-alias-label-primary': custom,
      '--dsw-alias-label-secondary': hexToRgba(custom, 0.82),
      '--dsw-alias-label-tertiary': hexToRgba(custom, 0.6),
      '--dsw-alias-label-caption': hexToRgba(custom, 0.6),
      '--dsw-alias-label-dimmed': hexToRgba(custom, 0.6),
    }
  }
  return fallback
}

const LIGHT_LABELS = {
  '--dsw-alias-label-primary': '#16233c',
  '--dsw-alias-label-secondary': '#46536b',
  '--dsw-alias-label-tertiary': '#6b7a92',
  '--dsw-alias-label-caption': '#6b7a92',
  '--dsw-alias-label-dimmed': '#6b7a92',
}
const DARK_LABELS = {
  '--dsw-alias-label-primary': '#eaf1fc',
  '--dsw-alias-label-secondary': '#b7c5da',
  '--dsw-alias-label-tertiary': '#8d9cb5',
  '--dsw-alias-label-caption': '#8d9cb5',
  '--dsw-alias-label-dimmed': '#8d9cb5',
}

/** Label tokens per scheme; a stored fontColor overrides both schemes. */
function labelTokens(config) {
  return {
    light: labelPair(schemeValue('fontColor', config, 'light'), LIGHT_LABELS),
    dark: labelPair(schemeValue('fontColor', config, 'dark'), DARK_LABELS),
  }
}

/**
 * Resolve the background setting for one color scheme to a served URL.
 * A stored value (preset id or `custom:<ext>`) overrides both schemes;
 * otherwise the scheme's default background is used. Falls back to the first
 * preset when the resolved id no longer exists.
 */
function resolveBackgroundUrl(config, scheme) {
  const presets = listPresets()
  const bg = schemeValue('background', config, scheme)
  if (typeof bg === 'string' && bg.startsWith('custom:')) {
    const ext = bg.slice('custom:'.length).replace(/[^a-z0-9]/gi, '')
    if (ext) return `${CUSTOM_PREFIX}custom-bg.${ext}`
  } else {
    const preset = presets.find((candidate) => candidate.id === bg)
    if (preset) return `${ASSETS_PREFIX}${preset.file}`
  }
  const fallback = presets[0]
  return fallback ? `${ASSETS_PREFIX}${fallback.file}` : null
}

function tokenBlock(selector, tokens) {
  const body = Object.entries(tokens).map(([name, value]) => `${name}:${value}`).join(';')
  return `${selector}{${body}}`
}

/**
 * Build the static theme <style> for one config. Uses `html body` (and
 * `html body[data-ds-dark-theme]`) so the token overrides outrank the base
 * sheets' plain `body` rules, while the ThemePresenter's inline variables
 * (from the browser half's overrideTokens) still outrank this stylesheet.
 */
export function buildStaticStyle(config) {
  const c = publicConfig(config)
  const urlLight = resolveBackgroundUrl(c, 'light')
  const urlDark = resolveBackgroundUrl(c, 'dark')
  const bgLight = urlLight ? `url("${urlLight}")` : 'none'
  const bgDark = urlDark ? `url("${urlDark}")` : 'none'
  const maskAlpha = Math.min(1, Math.max(0, Number(c.maskOpacity) || 0))
  const labels = labelTokens(c)
  const surfaces = {
    light: surfaceTokens(maskAlpha, schemeValue('inputColor', c, 'light'), schemeValue('sidebarColor', c, 'light')).light,
    dark: surfaceTokens(maskAlpha, schemeValue('inputColor', c, 'dark'), schemeValue('sidebarColor', c, 'dark')).dark,
  }
  const maskRgbLight = maskRgbString(schemeValue('maskColor', c, 'light'), 'light')
  const maskRgbDark = maskRgbString(schemeValue('maskColor', c, 'dark'), 'dark')
  return `<style data-plugin="dsh-columbina-theme" data-dsh-columbina-static="1">:root{--columbina-bg-image:${bgLight};--columbina-mask-alpha:${maskAlpha};--columbina-mask-rgb:${maskRgbLight}}body[data-ds-dark-theme]{--columbina-bg-image:${bgDark};--columbina-mask-rgb:${maskRgbDark}}body::before{content:"";position:fixed;inset:0;z-index:-2;background:var(--columbina-bg-image) center/cover no-repeat;pointer-events:none}body::after{content:"";position:fixed;inset:0;z-index:-1;background:rgba(var(--columbina-mask-rgb),var(--columbina-mask-alpha));pointer-events:none}${tokenBlock('html body', { ...surfaces.light, ...labels.light })}${tokenBlock('html body[data-ds-dark-theme]', { ...surfaces.dark, ...labels.dark })}body[data-columbina-title="on"] [role="treeitem"][aria-selected="true"]{background:linear-gradient(90deg,rgba(126,170,255,0.32),rgba(126,170,255,0.12) 55%,rgba(126,170,255,0.04))!important}@supports ((-webkit-background-clip:text) or (background-clip:text)){body[data-columbina-title="on"] [role="treeitem"][aria-selected="true"]>span[class$="_title"]{background:linear-gradient(92deg,#8ecbff 0%,#b9a8ff 48%,#eef4ff 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:600;filter:drop-shadow(0 0 6px rgba(126,170,255,0.5))}}</style>`
}

/** Insert the static <style> into <head> and the title-attribute boot script after <body>. */
export function injectStaticTheme(html, config) {
  const style = buildStaticStyle(config)
  const head = /<head(?:\s[^>]*)?>/i.exec(html)
  let out = head
    ? `${html.slice(0, head.index + head[0].length)}${style}${html.slice(head.index + head[0].length)}`
    : `${style}${html}`
  if (publicConfig(config).activeTitle !== false) {
    const boot = `<script>document.body&&document.body.setAttribute('data-columbina-title','on')<\/script>`
    const body = /<body(?:\s[^>]*)?>/i.exec(out)
    if (body) out = `${out.slice(0, body.index + body[0].length)}${boot}${out.slice(body.index + body[0].length)}`
  }
  return out
}

async function readPatch(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 8192) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('patch must be an object')
  const allowed = new Set(Object.keys(defaults))
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error('patch contains an unknown setting')
  return value
}

async function readBody(req, limit) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('upload is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function createConfigHandler(store) {
  const view = () => ({
    ...store.get(),
    customBackground: currentCustomUrl(),
    presets: listPresets().map(({ id, file, thumb }) => ({ id, file, thumb: thumb ?? null })),
  })
  return async (req, res) => {
    if (!localOnly(req, res)) return
    if (req.method === 'GET') {
      jsonResponse(res, 200, view())
      return
    }
    if (req.method !== 'PATCH') {
      jsonResponse(res, 405, { error: 'method not allowed' })
      return
    }
    try {
      await store.update(await readPatch(req))
      jsonResponse(res, 200, view())
    } catch (error) {
      jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

export function createUploadHandler(store) {
  return async (req, res) => {
    if (!localOnly(req, res)) return
    if (req.method === 'GET') {
      jsonResponse(res, 200, { url: currentCustomUrl() })
      return
    }
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { error: 'method not allowed' })
      return
    }
    const declared = String(req.headers['content-type'] ?? '').split(';')[0].trim()
    const ext = UPLOAD_TYPES[declared]
    if (!ext) {
      jsonResponse(res, 415, { error: `unsupported content type "${declared}" — use png, jpeg, webp or gif` })
      return
    }
    try {
      const body = await readBody(req, MAX_UPLOAD_BYTES)
      if (body.length === 0) throw new Error('empty upload')
      await mkdir(dataDir(), { recursive: true })
      const target = customFilePath(ext)
      await writeFile(target, body)
      const url = `${CUSTOM_PREFIX}custom-bg.${ext}`
      // Point the active background at the freshly uploaded image.
      await store.update({ background: `custom:${ext}` }).catch(() => {})
      jsonResponse(res, 200, { url, background: `custom:${ext}` })
    } catch (error) {
      jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Serve one preset image (id resolved through the live asset scan). */
function servePreset(res, id) {
  const preset = listPresets().find((candidate) => candidate.id === id)
  if (!preset) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const file = containedPath(ASSETS_DIR, preset.file)
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  res.writeHead(200, {
    'content-type': preset.type,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  })
  createReadStream(file).pipe(res)
}

/**
 * Serve (generating and caching on first request) a small preview thumbnail
 * for large preset images, so the settings grid never loads a multi-megabyte
 * original. Falls back to 404 when sharp is unavailable — the client then
 * shows the original swatch.
 */
async function serveThumb(res, id) {
  const preset = listPresets().find((candidate) => candidate.id === id)
  if (!preset || !preset.thumb) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const source = join(ASSETS_DIR, preset.file)
  const relative = `thumbs/${id}.${THUMB_EXT}`
  const target = join(dataDir(), relative)
  try {
    if (!existsSync(target)) {
      const sharp = await getSharp()
      if (!sharp) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('thumbnail unavailable')
        return
      }
      await mkdir(dirname(target), { recursive: true })
      // Never write through a planted symlink.
      unlinkIfSymlink(target)
      await sharp(source)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(target)
    }
    const safe = containedPath(dataDir(), relative)
    if (!safe) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('forbidden')
      return
    }
    res.writeHead(200, {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
    })
    createReadStream(safe).pipe(res)
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('thumbnail failed')
  }
}

/** Serve an uploaded custom background (exact stored filename only). */
function serveCustom(res, name) {
  const match = /^custom-bg\.(png|jpg|webp|gif)$/.exec(name)
  if (!match) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const file = containedPath(dataDir(), name)
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  res.writeHead(200, {
    'content-type': contentTypeFor(match[1]),
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  })
  createReadStream(file).pipe(res)
}

function mount(ctx, config = {}) {
  const store = createConfigStore(ctx, config)

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (httpCtx) => {
      httpCtx.effect(
        () => httpCtx.webServer.tapIndex((html) => injectStaticTheme(html, store.get())),
        'dsh-columbina-theme: static theme style',
      )
      httpCtx.effect(
        () => httpCtx.webServer.register({ kind: 'exact', path: CONFIG_ENDPOINT, handler: createConfigHandler(store) }),
        'dsh-columbina-theme: config endpoint',
      )
      httpCtx.effect(
        () => httpCtx.webServer.register({ kind: 'exact', path: UPLOAD_ENDPOINT, handler: createUploadHandler(store) }),
        'dsh-columbina-theme: upload endpoint',
      )
      httpCtx.effect(
        () => httpCtx.webServer.register({
          kind: 'prefix',
          path: ASSETS_PREFIX.slice(0, -1),
          handler: (req, res) => {
            const stem = decodeURIComponent(req.url?.slice(ASSETS_PREFIX.length) ?? '').replace(/\.(svg|png|jpe?g|webp|gif)$/i, '')
            servePreset(res, stem)
          },
        }),
        'dsh-columbina-theme: preset assets route',
      )
      httpCtx.effect(
        () => httpCtx.webServer.register({
          kind: 'prefix',
          path: THUMBS_PREFIX.slice(0, -1),
          handler: async (req, res) => {
            const stem = decodeURIComponent(req.url?.slice(THUMBS_PREFIX.length) ?? '').replace(/\.jpg$/, '')
            await serveThumb(res, stem)
          },
        }),
        'dsh-columbina-theme: preset thumbnail route',
      )
      httpCtx.effect(
        () => httpCtx.webServer.register({
          kind: 'prefix',
          path: CUSTOM_PREFIX.slice(0, -1),
          handler: (req, res) => {
            const name = decodeURIComponent(req.url?.slice(CUSTOM_PREFIX.length) ?? '')
            serveCustom(res, name)
          },
        }),
        'dsh-columbina-theme: custom background route',
      )
    })
  }
}

export function apply(ctx, config = {}) {
  mount(ctx, config)
}
