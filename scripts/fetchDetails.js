#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import { DATA_DIR } from './config.js'
const configPath = path.resolve('data/config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const { apiBaseUrl, apiKey } = config

const OUTAGES_FILE = path.join(DATA_DIR, 'outages.json')
const DETAILS_DIR = path.join(DATA_DIR, 'details')

;(async () => {
  try {
    console.log('Fetching outage details...')

    // Ensure the outages file exists
    if (!fs.existsSync(OUTAGES_FILE)) {
      throw new Error(
        `Outages file not found at ${OUTAGES_FILE}. Please run fetchOutages.js first.`,
      )
    }

    // Read outages data
    const { outageMessage } = fs.readJsonSync(OUTAGES_FILE)
    if (!Array.isArray(outageMessage) || outageMessage.length === 0) {
      console.log('No outages to fetch details for.')
      return
    }

    // Delete all existing details
    fs.emptyDirSync(DETAILS_DIR)
    console.log('Cleared all existing details.')

    // Fetch and save details for current outages
    for (const outage of outageMessage) {
      const outageId = outage.i
      const detailFile = path.join(DETAILS_DIR, `${outageId}.json`)

      console.log(`Fetching details for outage ${outageId}...`)

      try {
        const response = await fetch(`${apiBaseUrl}/v1.0/outages/${outageId}`, {
          headers: {
            'api-subscription-key': apiKey,
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch details for outage ${outageId}: ${response.statusText}`)
        }

        const detailJson = await response.json()

        // Save detail data to a file
        fs.writeJsonSync(detailFile, detailJson, { spaces: 2 })
        console.log(`Detail for outage ${outageId} saved to ${detailFile}`)
      } catch (error) {
        console.error(`Error fetching details for outage ${outageId}:`, error.message)
      }
    }

    console.log('All outage details fetched.')
  } catch (error) {
    console.error('Error fetching outage details:', error.message)
  }
})()
