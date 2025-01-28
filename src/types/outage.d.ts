// src/types/outage.d.ts
export type OutageDetail = {
  outageId: string
  outageType: 'Fault' | 'Planned' | 'Restored'
  point: {
    c: string
  }
  location: string
  plannerGroup: string
  numCustAffected: number
  startTime: string
  estRestoreTime: string
  statusMessage: string
  restoreTime: string
}
