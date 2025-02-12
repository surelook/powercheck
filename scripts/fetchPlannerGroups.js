#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import { DATA_DIR } from './config.js'
const configPath = path.resolve('data/config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const { apiBaseUrl, apiKey } = config

const PLANNERGROUPS_FILE = path.join(DATA_DIR, 'plannergroups.json')

;(async () => {
  try {
    console.log('Fetching planner groups...')

    const response = await fetch(`${apiBaseUrl}/v1.0/plannergroups`, {
      headers: {
        'api-subscription-key': apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch planner groups: ${response.statusText}`)
    }

    const plannergroupsJson = await response.json()

    // Ensure the data directory exists
    fs.ensureDirSync(DATA_DIR)

    // Save planner groups data to JSON file
    fs.writeJsonSync(PLANNERGROUPS_FILE, plannergroupsJson, { spaces: 2 })
    console.log(`Planner groups saved to ${PLANNERGROUPS_FILE}`)
  } catch (error) {
    console.error('Error fetching planner groups:', error.message)
    process.exit(1)
  }
})()
