import path from 'path'

export const DATA_DIR = path.join(process.cwd(), 'data')
export const DETAILS_DIR = path.join(DATA_DIR, 'details')
// Checkout of the history branch in CI, which keeps every snapshot ever recorded
export const ARCHIVE_DIR = path.join(DATA_DIR, 'archive')
// The recent slice of the archive that's published with the site
export const HISTORY_DIR = path.join(DATA_DIR, 'history')
