import fs from 'fs'
import path from 'path'

const STORE_PATH = path.resolve('.demo_usage.json')

export type DemoUsageRow = {
  userId: string
  lastTs: number
}

export function loadUsage(): DemoUsageRow[] {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw) as DemoUsageRow[]
  } catch {
    return []
  }
}

export function saveUsage(rows: DemoUsageRow[]) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(rows, null, 2))
}
