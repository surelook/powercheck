#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import { DATA_DIR } from './config.js'
const configPath = path.resolve('data/config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const { apiBaseUrl, apiKey } = config

const OUTAGES_FILE = path.join(DATA_DIR, 'outages.json')

;(async () => {
  try {
    console.log('Fetching outages...')

    const response = await fetch(`${apiBaseUrl}/v1.0/outages`, {
      headers: {
        'api-subscription-key': apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch outages: ${response.statusText}`)
    }

    const outagesJson = await response.json()

    // Ensure the data directory exists
    fs.ensureDirSync(DATA_DIR)

    // Save outages data to JSON file
    fs.writeJsonSync(OUTAGES_FILE, outagesJson, { spaces: 2 })
    console.log(`Outages saved to ${OUTAGES_FILE}`)
  } catch (error) {
    console.error('Error fetching outages:', error.message)
  }
})()
