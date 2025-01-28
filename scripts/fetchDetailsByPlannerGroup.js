#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import { DATA_DIR } from './config.js'
const configPath = path.resolve('data/config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
const { apiBaseUrl, apiKey } = config

const PLANNERGROUPS_FILE_FILE = path.join(DATA_DIR, 'plannergroups.json')
const DETAILS_DIR = path.join(DATA_DIR, 'details')

;(async () => {
  try {
    console.log('Fetching outage details...')

    // Ensure the outages file exists
    if (!fs.existsSync(PLANNERGROUPS_FILE_FILE)) {
      throw new Error(
        `Planner groups file not found at ${PLANNERGROUPS_FILE_FILE}. Please run fetchPlannerGroups.js first.`,
      )
    }

    // Read outages data
    const { plannerGroup } = fs.readJsonSync(PLANNERGROUPS_FILE_FILE)
    if (!Array.isArray(plannerGroup) || plannerGroup.length === 0) {
      console.log('No planner groups to fetch details for.')
      return
    }

    // Delete all existing details
    fs.emptyDirSync(DETAILS_DIR)
    console.log('Cleared all existing details.')

    for (const planner of plannerGroup) {
      const plannerNamme = planner.name

      console.log(`Fetching outages for planner ${plannerNamme}...`)

      try {
        const response = await fetch(`${apiBaseUrl}/v1.0/plannergroups/${plannerNamme}/outages?results=999999`, {
          headers: {
            'api-subscription-key': apiKey,
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch details for outage ${outageId}: ${response.statusText}`)
        }

        const { outageDetail } = await response.json()

        for (const outage of outageDetail) {
          const outageId = outage.outageId
          const detailFile = path.join(DETAILS_DIR, `${outageId}.json`)

             // Save detail data to a file
          fs.writeJsonSync(detailFile, outage, { spaces: 2 })
          console.log(`Detail for outage ${outageId} saved to ${detailFile}`)
        }
      } catch (error) {
        console.error(`Error fetching outages for planner ${plannerNamme}:`, error.message)
      }
    }

    console.log('All outage details fetched.')
  } catch (error) {
    console.error('Error fetching outage details:', error.message)
  }
})()
