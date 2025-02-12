import puppeteer from 'puppeteer'
import fs from 'fs-extra'

async function fetchConfig() {
  const isCI = process.env.CI === 'true'

  const browser = await puppeteer.launch({
    headless: 'new',
    args: isCI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  })
  const page = await browser.newPage()

  console.log('Loading page...')
  await page.goto('https://powercheck.esbnetworks.ie/', { waitUntil: 'domcontentloaded' })

  console.log('Extracting settings...')
  const settings = await page.evaluate(() => {
    return window.settings || {} // Check if `window.settings` exists
  })

  await browser.close()

  if (!settings.apiBaseUrl || !settings.apiKey) {
    console.error('Failed to extract API details.')
    process.exit(1)
  }

  // Save extracted settings to a JSON file
  const config = {
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
  }

  fs.ensureDirSync('./data')
  fs.writeFileSync('./data/config.json', JSON.stringify(config, null, 2))

  console.log('API details saved to config.json')
}

fetchConfig().catch((error) => {
  console.error(error)
  process.exit(1)
})
