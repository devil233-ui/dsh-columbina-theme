import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/Users/zhzx/dsh-dafeiyu/test/')
const { chromium } = require('playwright-core')

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:51753'
const OUT = process.env.OUT_DIR || 'C:/dsh/columbina-theme/docs'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-first-run', '--disable-extensions'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (err) => errors.push(String(err)))
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForSelector('style[data-plugin="dsh-columbina-theme"]', { state: 'attached', timeout: 20000 })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/screenshot-home.png` })

// Open the settings card.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => ((b.getAttribute('aria-label') || b.title || b.textContent || '').trim()) === '设置')
  btn?.click()
})
await page.waitForTimeout(1200)
await page.evaluate(() => {
  const tab = [...document.querySelectorAll('[role="tab"], button')].find((b) => /^(插件|Plugins)$/.test((b.getAttribute('aria-label') || b.title || b.textContent || '').trim()))
  tab?.click()
})
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/screenshot-settings.png` })
console.log('ERRORS:', JSON.stringify(errors))
await browser.close()
