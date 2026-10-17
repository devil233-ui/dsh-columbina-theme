window.__ModuleLoader__.load({ id: 'dsh-columbina-theme', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useEffect, useRef, useState } = React

  const CONFIG_ENDPOINT = '/plugins/dsh-columbina-theme/config'
  const ASSET_BASE = '/plugins/dsh-columbina-theme/assets/'
  const UPLOAD_ENDPOINT = '/plugins/dsh-columbina-theme/background'

  /** Fallback preset list until the config fetch supplies the live scan. */
  const PRESETS = [
    { id: 'columbina-1', label: 'columbina-1', file: 'columbina-1.png' },
    { id: 'columbina-2', label: 'columbina-2', file: 'columbina-2.png' },
  ]

  /** Live preset list from the host asset scan; refreshed on every config fetch. */
  let presetList = PRESETS.map(({ id, label, file }) => ({ id, label, file }))

  const DEFAULTS = {
    background: '',
    maskOpacity: 0.45,
    maskColor: '',
    inputColor: '',
    sidebarColor: '',
    fontColor: '',
    activeTitle: true,
  }

  /**
   * Per-scheme defaults applied when the stored setting is empty — mirrors
   * src/index.js SCHEME_DEFAULTS (keep both halves in sync).
   */
  const SCHEME_DEFAULTS = {
    light: { background: 'columbina-1', maskColor: '', inputColor: '#c8d1fe', sidebarColor: '#e5eaff', fontColor: '#78007a' },
    dark: { background: 'columbina-2', maskColor: '', inputColor: '#140010', sidebarColor: '#140010', fontColor: '#acabf2' },
  }

  function currentScheme() {
    return typeof document !== 'undefined' && document.body?.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
  }

  /** Stored override, else the scheme default. */
  function schemeValue(field, config) {
    const stored = config[field]
    if (typeof stored === 'string' && stored.trim() !== '') return stored
    return SCHEME_DEFAULTS[currentScheme()][field]
  }

  const TITLE_ATTR = 'data-columbina-title'
  const BG_PROP = '--columbina-bg-image'
  const MASK_PROP = '--columbina-mask-alpha'

  // NOTE: the layer structure and the token value tables below mirror
  // src/index.js buildStaticStyle()/SURFACE_TOKENS/labelTokens() — the host
  // bakes the same rules into every served index.html (webServer.tapIndex) so
  // the theme is applied at first paint; this half only re-applies the values
  // dynamically. Keep both halves in sync when adjusting colors.

  // ---------- helpers ----------

  function hexToRgba(hex, alpha) {
    const value = hex.replace('#', '')
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  function isHex(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
  }

  /** '#rrggbb' → 'r, g, b' for the --columbina-mask-rgb custom property. */
  function hexToRgbString(hex) {
    const value = hex.replace('#', '')
    return `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`
  }

  /** Adopt the live preset list from a config response. */
  function adoptPresets(raw) {
    if (Array.isArray(raw) && raw.length > 0) {
      presetList = raw.map(({ id, file, thumb }) => ({ id, file, thumb: thumb || null, label: id }))
    }
    return presetList
  }

  /** URL for one resolved background id (preset or custom:<ext>). */
  function backgroundUrl(bgId) {
    if (typeof bgId === 'string' && bgId.startsWith('custom:')) {
      const ext = bgId.slice('custom:'.length).replace(/[^a-z0-9]/gi, '')
      if (ext) return `/plugins/dsh-columbina-theme/custom/custom-bg.${ext}`
      return null
    }
    const preset = presetList.find((candidate) => candidate.id === bgId)
    if (preset) return `${ASSET_BASE}${preset.file}`
    return presetList[0] ? `${ASSET_BASE}${presetList[0].file}` : null
  }

  /** Resolve one field for an explicit scheme (stored override, else scheme default). */
  function resolveFor(config, field, scheme) {
    const stored = config[field]
    if (typeof stored === 'string' && stored.trim() !== '') return stored
    return SCHEME_DEFAULTS[scheme][field]
  }

  /** Label tokens for one resolved font color; empty → the scheme's built-ins. */
  function labelPair(fontColor, fallback) {
    if (isHex(fontColor)) {
      return {
        p: fontColor,
        s: hexToRgba(fontColor, 0.82),
        t: hexToRgba(fontColor, 0.6),
      }
    }
    return fallback
  }

  const LIGHT_LABELS = { p: '#16233c', s: '#46536b', t: '#6b7a92' }
  const DARK_LABELS = { p: '#eaf1fc', s: '#b7c5da', t: '#8d9cb5' }

  /** Surface + label color tokens, one { light, dark } pair per token. */
  function buildTokens(config) {
    const light = {
      font: labelPair(resolveFor(config, 'fontColor', 'light'), LIGHT_LABELS),
      input: resolveFor(config, 'inputColor', 'light'),
      sidebar: resolveFor(config, 'sidebarColor', 'light'),
    }
    const dark = {
      font: labelPair(resolveFor(config, 'fontColor', 'dark'), DARK_LABELS),
      input: resolveFor(config, 'inputColor', 'dark'),
      sidebar: resolveFor(config, 'sidebarColor', 'dark'),
    }
    // Main content areas follow the mask (alpha 0 at mask 0 = pure original
    // background); the input box is fixed at 80% opacity; the sidebar and
    // elevated surfaces stay opaque — mirror src/index.js surfaceTokens().
    const a = Math.min(1, Math.max(0, Number(config.maskOpacity) || 0))
    const inputRgb = (scheme, fallback) => isHex(scheme) ? hexToRgbString(scheme) : fallback
    const sidebarRgb = (scheme, fallback) => isHex(scheme) ? hexToRgbString(scheme) : fallback
    return {
      '--dsw-alias-bg-base': { light: `rgba(255, 255, 255, ${a})`, dark: `rgba(21, 21, 23, ${a})` },
      '--dsw-specific-input-major': { light: `rgba(${inputRgb(light.input, '255, 255, 255')}, 0.8)`, dark: `rgba(${inputRgb(dark.input, '44, 44, 46')}, 0.8)` },
      '--dsw-specific-tip': { light: `rgba(245, 246, 247, ${a})`, dark: `rgba(44, 44, 46, ${a})` },
      '--dsw-specific-bubble': { light: `rgba(237, 243, 254, ${a})`, dark: `rgba(44, 44, 46, ${a})` },
      '--dsw-specific-bubble-highlight': { light: `rgba(211, 226, 255, ${a})`, dark: `rgba(53, 54, 56, ${a})` },
      '--dsw-specific-sidebar-fill': { light: `rgb(${sidebarRgb(light.sidebar, '249, 250, 251')})`, dark: `rgb(${sidebarRgb(dark.sidebar, '27, 27, 28')})` },
      '--dsw-alias-label-primary': { light: light.font.p, dark: dark.font.p },
      '--dsw-alias-label-secondary': { light: light.font.s, dark: dark.font.s },
      '--dsw-alias-label-tertiary': { light: light.font.t, dark: dark.font.t },
      '--dsw-alias-label-caption': { light: light.font.t, dark: dark.font.t },
      '--dsw-alias-label-dimmed': { light: light.font.t, dark: dark.font.t },
    }
  }

  let themeService = null
  let disposeThemeOverride = null
  let lastScheme = 'light'
  let latestConfig = null

  function applyConfig(config, scheme = currentScheme()) {
    adoptPresets(config && config.presets)
    const merged = { ...DEFAULTS, ...config }
    latestConfig = merged
    lastScheme = scheme
    const root = document.documentElement
    const url = backgroundUrl(resolveFor(merged, 'background', scheme))
    root.style.setProperty(BG_PROP, url ? `url("${url}")` : 'none')
    const opacity = Math.min(1, Math.max(0, Number(merged.maskOpacity) || 0))
    root.style.setProperty(MASK_PROP, String(opacity))
    const maskColor = resolveFor(merged, 'maskColor', scheme)
    if (isHex(maskColor)) root.style.setProperty('--columbina-mask-rgb', hexToRgbString(maskColor))
    else root.style.removeProperty('--columbina-mask-rgb')
    if (merged.activeTitle !== false) document.body.setAttribute(TITLE_ATTR, 'on')
    else document.body.removeAttribute(TITLE_ATTR)
    if (themeService) {
      // DSH 0.2 replaces the layer of the same source and returns a disposer
      // for the new layer; the previous disposer becomes a no-op. Keep the
      // latest one for teardown.
      disposeThemeOverride = themeService.overrideTokens('dsh-columbina-theme', buildTokens(merged)) ?? null
    }
  }

  async function fetchConfig() {
    const response = await fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
    if (!response.ok) throw new Error(`config request failed: ${response.status}`)
    return response.json()
  }

  // ---------- settings card ----------

  const cardStyle = {
    listStyle: 'none',
    border: '1px solid var(--dsw-alias-border-l4, #d8d8d8)',
    borderRadius: 12,
    padding: 16,
    // Official settings cards use the card-fill token; it also gives the card
    // a readable surface on the plugin manager's page, where it is not nested
    // in the settings panel.
    background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, transparent))',
    display: 'grid',
    gap: 14,
  }
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }
  const labelBlockStyle = { display: 'block', fontWeight: 600 }
  const hintStyle = { display: 'block', opacity: 0.65, marginTop: 3, fontWeight: 400 }
  const gridStyle = {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
  }
  const swatchStyle = {
    aspectRatio: '16 / 9', borderRadius: 10, border: '2px solid transparent', cursor: 'pointer',
    backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative',
  }
  const swatchSelectedStyle = { borderColor: '#4176e6', boxShadow: '0 0 0 2px rgba(65, 118, 230, 0.35)' }
  const swatchLabelStyle = {
    position: 'absolute', left: 6, bottom: 5, fontSize: 11, lineHeight: '16px',
    background: 'rgba(0, 0, 0, 0.55)', color: '#fff', borderRadius: 6, padding: '0 6px',
  }

  function Field({ label, hint, children }) {
    return React.createElement('label', { style: rowStyle },
      React.createElement('span', null,
        React.createElement('span', { style: labelBlockStyle }, label),
        hint ? React.createElement('small', { style: hintStyle }, hint) : null,
      ),
      children,
    )
  }

  function ColumbinaCard() {
    const [status, setStatus] = useState('loading')
    const [value, setValue] = useState(DEFAULTS)
    const [busy, setBusy] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [schemeTick, setSchemeTick] = useState(0)
    const patchSeq = useRef(0)
    const fileRef = useRef(null)
    const sliderTimers = useRef(new Map())
    const writable = status === 'ready' && !busy

    const refresh = async () => {
      const next = await fetchConfig()
      setValue({ ...DEFAULTS, ...next })
      setStatus('ready')
      applyConfig(next)
    }

    useEffect(() => {
      let active = true
      fetchConfig()
        .then((next) => {
          if (!active) return
          setValue({ ...DEFAULTS, ...next })
          setStatus('ready')
          applyConfig(next)
        })
        .catch(() => { if (active) setStatus('unavailable') })
      // Re-render when the light/dark scheme flips so the pickers and the
      // background highlight follow the active scheme.
      const observer = new MutationObserver(() => setSchemeTick((t) => t + 1))
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'data-columbina-title'] })
      return () => {
        active = false
        observer.disconnect()
        for (const timer of sliderTimers.current.values()) clearTimeout(timer)
        sliderTimers.current.clear()
      }
    }, [])

    const write = async (field, next) => {
      const seq = ++patchSeq.current
      setBusy(true)
      try {
        const response = await fetch(CONFIG_ENDPOINT, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [field]: next }),
        })
        if (!response.ok) throw new Error(`settings write failed: ${response.status}`)
        const updated = await response.json()
        if (seq === patchSeq.current) {
          const merged = { ...DEFAULTS, ...updated }
          setValue(merged)
          setStatus('ready')
          applyConfig(updated)
        }
      } catch {
        if (seq === patchSeq.current) setStatus('unavailable')
      } finally {
        if (seq === patchSeq.current) setBusy(false)
      }
    }

    const writeSlider = (field, next) => {
      setValue((prev) => ({ ...prev, [field]: next }))
      patchSeq.current += 1
      const pending = sliderTimers.current.get(field)
      if (pending) clearTimeout(pending)
      const timer = setTimeout(() => {
        sliderTimers.current.delete(field)
        void write(field, next)
      }, 250)
      sliderTimers.current.set(field, timer)
    }

    const upload = async (file) => {
      if (!file) return
      setUploading(true)
      try {
        const response = await fetch(UPLOAD_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': file.type || 'application/octet-stream' },
          body: file,
        })
        if (!response.ok) throw new Error(`upload failed: ${response.status}`)
        const result = await response.json()
        if (result.url) {
          await refresh()
        }
      } catch {
        setStatus('unavailable')
      } finally {
        setUploading(false)
      }
    }

    const dark = document.body.hasAttribute('data-ds-dark-theme')
    const eff = (field, builtinLight, builtinDark) => {
      const resolved = schemeValue(field, value)
      return resolved || (dark ? builtinDark : builtinLight)
    }
    const effectiveFont = eff('fontColor', '#16233c', '#eaf1fc')
    const effectiveMask = eff('maskColor', '#ffffff', '#151517')
    const effectiveInput = eff('inputColor', '#ffffff', '#2c2c2e')
    const effectiveSidebar = eff('sidebarColor', '#f9fafb', '#1b1b1c')
    const maskPercent = Math.round((Number(value.maskOpacity) || 0) * 100)
    const isCustom = typeof value.background === 'string' && value.background.startsWith('custom:')
    const customExt = (value.customBackground || '').match(/custom-bg\.(png|jpg|webp|gif)$/)?.[1]
    const presets = Array.isArray(value.presets) && value.presets.length > 0
      ? value.presets.map(({ id, file, thumb }) => ({ id, file, thumb: thumb || null, label: id }))
      : PRESETS
    // The currently effective background (scheme default when unset) — the
    // grid highlights it; clicking it again clears the override (auto mode).
    const effectiveBg = value.background || SCHEME_DEFAULTS[dark ? 'dark' : 'light'].background

    /** One color row: label/hint + color input + 恢复默认 when customized. */
    const colorRow = (label, hint, field, effective) =>
      React.createElement(Field, { label, hint },
        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('input', {
            type: 'color', value: effective, disabled: !writable,
            onChange: (event) => void write(field, event.target.value),
          }),
          value[field]
            ? React.createElement('button', {
                type: 'button', style: { fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', padding: 0, textDecoration: 'underline' },
                onClick: () => void write(field, ''),
              }, '恢复默认')
            : React.createElement('span', { style: { fontSize: 12, opacity: 0.6 } }, '默认'),
        ),
      )

    return React.createElement('li', { style: cardStyle, 'data-testid': 'dsh-columbina-theme-settings' },
      React.createElement('div', null,
        React.createElement('strong', { style: { fontSize: 16 } }, '哥伦比娅主题'),
        React.createElement('p', { style: { margin: '5px 0 0', opacity: 0.72 } }, '背景、蒙版与字体颜色——来自挪德卡莱的月光。'),
      ),
      status === 'unavailable'
        ? React.createElement('span', { role: 'status' }, '哥伦比娅主题设置尚未连接到 DSH Host。')
        : status === 'loading'
        ? React.createElement('span', null, '正在读取设置…')
        : React.createElement(React.Fragment, null,
          React.createElement(Field, { label: '背景预设', hint: `${value.background ? '已固定为该背景（再点一次可恢复自动）' : '自动：浅色 columbina-1 / 深色 columbina-2'}；也可上传自定义图片。` },
            React.createElement('div', { style: { display: 'grid', gap: 10, width: '100%' } },
              React.createElement('div', { style: gridStyle },
                ...presets.map((preset) =>
                  React.createElement('button', {
                    key: preset.id,
                    type: 'button',
                    title: preset.label,
                    disabled: !writable,
                    style: {
                      ...swatchStyle,
                      backgroundImage: `url("${preset.thumb || `${ASSET_BASE}${preset.file}`}")`,
                      ...(effectiveBg === preset.id ? swatchSelectedStyle : {}),
                    },
                    onClick: () => {
                      // Re-clicking the effective preset clears the override (auto mode).
                      if (effectiveBg === preset.id && value.background) void write('background', '')
                      else void write('background', preset.id)
                    },
                  },
                    React.createElement('span', { style: swatchLabelStyle }, preset.label),
                  ),
                ),
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                React.createElement('button', {
                  type: 'button', disabled: !writable || uploading,
                  style: { padding: '6px 12px', borderRadius: 8, cursor: 'pointer' },
                  onClick: () => fileRef.current?.click(),
                }, uploading ? '上传中…' : '上传自定义图片'),
                React.createElement('input', {
                  ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif',
                  style: { display: 'none' },
                  onChange: (event) => {
                    const file = event.target.files?.[0]
                    if (file) void upload(file)
                    event.target.value = ''
                  },
                }),
                isCustom
                  ? React.createElement('span', { style: { fontSize: 12, opacity: 0.7 } }, '已使用自定义图片')
                  : customExt
                  ? React.createElement('button', {
                      type: 'button', style: { fontSize: 12, opacity: 0.7, cursor: 'pointer', background: 'none', border: 'none', padding: 0 },
                      onClick: () => void write('background', `custom:${customExt}`),
                    }, '使用已上传的图片')
                  : null,
              ),
            ),
          ),
          React.createElement(Field, { label: '蒙版不透明度', hint: `${maskPercent}% —— 0% 为原图效果（面板通透度同步归零），越高越不透明，100% 完全覆盖为主题底色。` },
            React.createElement('input', {
              type: 'range', min: 0, max: 1, step: 0.05, value: Number(value.maskOpacity) || 0,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('maskOpacity', Number(event.target.value)),
            }),
          ),
          React.createElement(Field, { label: '字体颜色', hint: '默认跟随明暗配色；选择后同时用于两种配色。' },
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              React.createElement('input', {
                type: 'color', value: effectiveFont, disabled: !writable,
                onChange: (event) => void write('fontColor', event.target.value),
              }),
              value.fontColor
                ? React.createElement('button', {
                    type: 'button', style: { fontSize: 12, cursor: 'pointer', background: 'none', border: 'none', padding: 0, textDecoration: 'underline' },
                    onClick: () => void write('fontColor', ''),
                  }, '恢复默认')
                : React.createElement('span', { style: { fontSize: 12, opacity: 0.6 } }, '默认'),
            ),
          ),
          colorRow('蒙版颜色', '留空 = 跟随明暗主题底色；选择后两种配色都用该颜色。', 'maskColor', effectiveMask),
          colorRow('输入框颜色', '输入框固定 80% 不透明；留空 = 跟随明暗主题默认色。', 'inputColor', effectiveInput),
          colorRow('侧边栏颜色', '侧边栏始终不透明；留空 = 跟随明暗主题默认色。', 'sidebarColor', effectiveSidebar),
          React.createElement(Field, { label: '选中会话标题特效', hint: '当前会话的标题使用蓝紫渐变与光晕。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.activeTitle !== false, disabled: !writable,
              onChange: (event) => void write('activeTitle', event.target.checked),
            }),
          ),
          busy ? React.createElement('small', { role: 'status' }, '正在保存…') : null,
        ),
    )
  }

  // ---------- plugin body ----------

  function apply(ctx) {
    themeService = ctx.theme || null
    lastScheme = currentScheme()
    // The host already baked the saved settings into the served <style>
    // (both schemes' backgrounds, masks, tokens, title attribute) — first
    // paint is correct without this half. Here we re-apply the live values
    // once the config fetch returns, and re-resolve the per-scheme values
    // when the user switches light/dark (the flip guard keeps our own
    // overrideTokens round-trips from recursing).
    const boot = () => {
      void fetchConfig()
        .then((next) => applyConfig(next))
        .catch(() => {})
    }
    if (typeof document !== 'undefined' && document.body) boot()
    else document.addEventListener('DOMContentLoaded', boot, { once: true })
    const syncScheme = (scheme) => {
      const next = scheme === 'dark' || scheme === 'light' ? scheme : currentScheme()
      if (next === lastScheme) return
      lastScheme = next
      if (typeof latestConfig === 'object' && latestConfig !== null) applyConfig(latestConfig, next)
    }
    // The theme snapshot names the resolved scheme, so it is authoritative
    // even when this listener runs before the presenter flips the body
    // attribute. The observer covers hosts that do not deliver the event to
    // sibling plugin contexts; the scheme guard makes the pair idempotent.
    ctx.on('theme/change', (snapshot) => syncScheme(snapshot?.active?.colorScheme))
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
      const observer = new MutationObserver(() => syncScheme(currentScheme()))
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      ctx.effect(() => () => observer.disconnect(), 'dsh-columbina-theme: scheme observer')
    }

    // The settings card's seats, one per host generation. `slots.inject`
    // waits for a declared slot, so a host that never declares one simply
    // never runs that registration — no version check is involved.
    const registerCard = (slot, options) => {
      ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, ...options }, ColumbinaCard))
    }
    // DSH 0.2: one page inside the Plugins settings section.
    registerCard('settings.plugins.tab', {
      id: 'dsh-columbina-theme',
      order: 60,
      label: () => '哥伦比娅主题',
      inject: () => ({}),
    })
    // DSH 0.2: the bundle's own page in the plugin manager (the summary view
    // is the row one-liner, which the package description already carries).
    ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
      name: 'plugins.bundle.config',
      key: 'dsh-columbina-theme',
      inject: () => ({}),
    }, (ownerProps) => (ownerProps && ownerProps.view === 'summary'
      ? null
      : React.createElement(ColumbinaCard))))
    // DSH 0.1.x: the settings list card.
    registerCard('settings.plugin.item', {
      key: 'dsh-columbina-theme',
      order: 30,
      inject: () => ({}),
    })

    ctx.effect(() => () => {
      themeService = null
      if (typeof disposeThemeOverride === 'function') disposeThemeOverride()
      disposeThemeOverride = null
      document.documentElement.style.removeProperty(BG_PROP)
      document.documentElement.style.removeProperty(MASK_PROP)
      document.documentElement.style.removeProperty('--columbina-mask-rgb')
      document.body.removeAttribute(TITLE_ATTR)
    }, 'dsh-columbina-theme: teardown')
  }

  module.exports = {
    name: 'dsh-columbina-theme-client',
    inject: ['slots', 'theme'],
    apply,
  }
  return module.exports
} })
