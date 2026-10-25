#!/usr/bin/env node

// Appends the outages just fetched to the archive, then publishes the last WINDOW_DAYS of it.
//
// The archive holds one file per UTC day, days/YYYY-MM-DD.json:
//   outages:   every distinct version of an outage seen that day
//   snapshots: [{ at, outages }], one per poll, where outages indexes into the list above
// The published index.json lists when every snapshot in the window was taken.

import fs from 'fs-extra'
import path from 'path'
import { ARCHIVE_DIR, DETAILS_DIR, HISTORY_DIR } from './config.js'

const WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

const ARCHIVE_DAYS_DIR = path.join(ARCHIVE_DIR, 'days')
const HISTORY_DAYS_DIR = path.join(HISTORY_DIR, 'days')

// One element per line, so each run's commit adds lines rather than rewriting one
const formatDay = ({ outages, snapshots }) =>
  `{"outages":[\n${outages.map((outage) => JSON.stringify(outage)).join(',\n')}\n],\n` +
  `"snapshots":[\n${snapshots.map((snapshot) => JSON.stringify(snapshot)).join(',\n')}\n]}\n`

const record = (at) => {
  const outages = fs
    .readdirSync(DETAILS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => fs.readJsonSync(path.join(DETAILS_DIR, file)))

  const dayFile = path.join(ARCHIVE_DAYS_DIR, `${at.slice(0, 10)}.json`)
  const day = fs.existsSync(dayFile) ? fs.readJsonSync(dayFile) : { outages: [], snapshots: [] }

  // Most outages are unchanged from one poll to the next, so each version is stored once
  const indexes = new Map(day.outages.map((outage, index) => [JSON.stringify(outage), index]))
  const snapshot = outages.map((outage) => {
    const key = JSON.stringify(outage)
    if (!indexes.has(key)) indexes.set(key, day.outages.push(outage) - 1)
    return indexes.get(key)
  })
  day.snapshots.push({ at, outages: snapshot })

  fs.outputFileSync(dayFile, formatDay(day))
  console.log(`Recorded ${outages.length} outages at ${at} to ${dayFile}`)
}

const publish = (at) => {
  const firstDay = new Date(Date.parse(at) - (WINDOW_DAYS - 1) * DAY_MS).toISOString().slice(0, 10)
  const files = fs
    .readdirSync(ARCHIVE_DAYS_DIR)
    .filter((file) => file.endsWith('.json') && file >= firstDay)
    .sort()

  // Written last, so a failure part-way leaves no index and the site shows no history
  fs.emptyDirSync(HISTORY_DIR)
  const snapshots = []
  for (const file of files) {
    const day = fs.readJsonSync(path.join(ARCHIVE_DAYS_DIR, file))
    fs.copySync(path.join(ARCHIVE_DAYS_DIR, file), path.join(HISTORY_DAYS_DIR, file))
    snapshots.push(...day.snapshots.map((snapshot) => snapshot.at))
  }
  fs.writeJsonSync(path.join(HISTORY_DIR, 'index.json'), { snapshots })
  console.log(`Published ${snapshots.length} snapshots from ${files.length} days to ${HISTORY_DIR}`)
}

const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
record(at)
publish(at)
