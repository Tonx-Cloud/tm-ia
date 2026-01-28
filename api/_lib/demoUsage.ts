import { loadUsage, saveUsage, type DemoUsageRow } from './demoUsageStore.js'

const DAY_MS = 24 * 60 * 60 * 1000
let cache = new Map<string, number>()

function ensureCache() {
  if (cache.size === 0) {
    const rows = loadUsage()
    cache = new Map(rows.map((r) => [r.userId, r.lastTs]))
  }
}

export function checkDemoLimit(userId: string) {
  ensureCache()
  const last = cache.get(userId)
  if (!last) return { blocked: false }
  const elapsed = Date.now() - last
  if (elapsed < DAY_MS) {
    return { blocked: true, retryInSeconds: Math.ceil((DAY_MS - elapsed) / 1000) }
  }
  return { blocked: false }
}

export function logDemoUsage(userId: string) {
  ensureCache()
  cache.set(userId, Date.now())
  persist()
}

export function getDemoUsageSnapshot() {
  ensureCache()
  return Array.from(cache.entries()).map(([userId, ts]) => ({ userId, lastTs: ts }))
}

function persist() {
  const rows: DemoUsageRow[] = Array.from(cache.entries()).map(([userId, lastTs]) => ({ userId, lastTs }))
  saveUsage(rows)
}
