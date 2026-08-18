import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire('C:/Users/zhzx/dsh-dafeiyu/test/')
const { chromium } = require('playwright-core')

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:61010'
const SHOT_DIR = new URL('../docs/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(SHOT_DIR, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-first-run', '--disable-extensions'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`) })
page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err)}`))

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForSelector('style[data-plugin="dsh-columbina-theme"]', { state: 'attached', timeout: 20000 })
await page.waitForTimeout(1200)

const applied = await page.evaluate(() => {
  const row = document.querySelector('[role="treeitem"][aria-selected="true"]')
  const titleSpan = row ? row.querySelector(':scope > span[class$="_title"]') : null
  return {
    staticStyle: !!document.querySelector('style[data-plugin="dsh-columbina-theme"]'),
    bgLayerImage: getComputedStyle(document.body, '::before').backgroundImage,
    maskLayerColor: getComputedStyle(document.body, '::after').backgroundColor,
    rootBgProp: document.documentElement.style.getPropertyValue('--columbina-bg-image'),
    rootMaskProp: document.documentElement.style.getPropertyValue('--columbina-mask-alpha'),
    titleAttr: document.body.getAttribute('data-columbina-title'),
    tokenBgBase: document.body.style.getPropertyValue('--dsw-alias-bg-base'),
    tokenLabel: document.body.style.getPropertyValue('--dsw-alias-label-primary'),
    computedBodyBg: getComputedStyle(document.body).backgroundColor,
    sidebarFillResolved: getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill'),
    maskRgbResolved: getComputedStyle(document.body).getPropertyValue('--columbina-mask-rgb'),
    selectedRow: !!row,
    selectedTitleColor: titleSpan ? getComputedStyle(titleSpan).color : null,
    selectedTitleBgImage: titleSpan ? getComputedStyle(titleSpan).backgroundImage.slice(0, 80) : null,
    selectedTitleWeight: titleSpan ? getComputedStyle(titleSpan).fontWeight : null,
  }
})
console.log('APPLIED:', JSON.stringify(applied, null, 2))
await page.screenshot({ path: `${SHOT_DIR}preview-e2e-home.png` })

// Open settings via the 设置 button, then the 插件 tab.
const settingsInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => {
    const label = (b.getAttribute('aria-label') || b.title || b.textContent || '').trim()
    return label === '设置' || label === 'Settings' || label.includes('设置')
  })
  if (!btn) return null
  return {
    aria: btn.getAttribute('aria-label'),
    title: btn.title,
    text: (btn.textContent || '').trim(),
    className: (btn.className || '').toString().slice(0, 80),
  }
})
console.log('SETTINGS BUTTON INFO:', JSON.stringify(settingsInfo, null, 2))
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => {
    const label = (b.getAttribute('aria-label') || b.title || b.textContent || '').trim()
    return label === '设置' || label === 'Settings' || label.includes('设置')
  })
  if (btn) { btn.click(); return true }
  return false
})
console.log('SETTINGS CLICKED:', clicked)
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOT_DIR}preview-e2e-settings-open.png` })

let cardFound = false
if (clicked) {
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"], button')]
      .map((b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim())
      .filter((t) => /插件|Plugins|常规|General/.test(t)).slice(0, 10),
  )
  console.log('TABS:', JSON.stringify(tabs, null, 2))
  const tabClicked = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[role="tab"], button')].find(
      (b) => /^(插件|Plugins)$/.test((b.getAttribute('aria-label') || b.title || b.textContent || '').trim()),
    )
    if (tab) { tab.click(); return true }
    return false
  })
  console.log('PLUGINS TAB CLICKED:', tabClicked)
  await page.waitForTimeout(1500)
  cardFound = await page.evaluate(() => !!document.querySelector('[data-testid="dsh-columbina-theme-settings"]'))
  console.log('CARD PRESENT:', cardFound)
  if (cardFound) {
    await page.screenshot({ path: `${SHOT_DIR}preview-e2e-settings.png` })
    const cardText = await page.evaluate(() => document.querySelector('[data-testid="dsh-columbina-theme-settings"]')?.textContent?.slice(0, 300))
    console.log('CARD TEXT:', JSON.stringify(cardText))
    const swatches = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="dsh-columbina-theme-settings"] button')]
        .map((b) => b.style.backgroundImage)
        .filter(Boolean)
        .map((v) => v.replace(/^url\("?/, '').replace(/"?\)$/, '').split('/').pop()),
    )
    console.log('SWATCH IMAGES:', JSON.stringify(swatches))
    const dialogBg = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      return dialog ? getComputedStyle(dialog).backgroundColor : null
    })
    console.log('SETTINGS DIALOG BG:', dialogBg)
  }
}

console.log('ERRORS:', JSON.stringify(errors, null, 2))
await browser.close()
process.exit(cardFound ? 0 : 2)
