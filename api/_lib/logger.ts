type LogLevel = 'info' | 'warn' | 'error'

export type LogContext = {
  requestId?: string
  userId?: string
}

export function createLogger(base: LogContext = {}) {
  const log = (level: LogLevel, event: string, meta: Record<string, unknown> = {}) => {
    const payload = {
      level,
      event,
      ...base,
      ...meta,
      ts: new Date().toISOString(),
    }
    const line = JSON.stringify(payload)
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  return {
    info: (event: string, meta?: Record<string, unknown>) => log('info', event, meta),
    warn: (event: string, meta?: Record<string, unknown>) => log('warn', event, meta),
    error: (event: string, meta?: Record<string, unknown>) => log('error', event, meta),
    child: (ctx: LogContext) => createLogger({ ...base, ...ctx }),
  }
}
