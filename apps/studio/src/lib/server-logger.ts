import { randomUUID } from 'node:crypto'

type LogLevel = 'info' | 'warn' | 'error'
type LogFields = Record<string, string | number | boolean | null | undefined>

const ansi = {
  reset: '\u001b[0m',
  key: '\u001b[33m',
  string: '\u001b[32m',
  number: '\u001b[36m',
  literal: '\u001b[35m',
  muted: '\u001b[90m',
  info: '\u001b[32m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
  event: '\u001b[36m',
}

const jsonTokenPattern =
  /("(?:[^"\\]|\\.)*"(?=\s*:))|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)/g

function colorizeJson(line: string, level: LogLevel, event: string) {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === '0') return line

  return line.replace(
    jsonTokenPattern,
    (
      token,
      keyToken: string | undefined,
      stringToken: string | undefined,
      numberToken: string | undefined,
    ) => {
      let color = ansi.muted
      if (keyToken) color = ansi.key
      else if (stringToken) {
        const value = JSON.parse(stringToken) as string
        color = value === level ? ansi[level] : value === event ? ansi.event : ansi.string
      } else if (numberToken) color = ansi.number
      else color = ansi.literal

      return `${color}${token}${ansi.reset}`
    },
  )
}

function writeLog(level: LogLevel, event: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    ...fields,
    timestamp: new Date().toISOString(),
    level,
    service: 'znith-studio',
    event,
  })

  const output = colorizeJson(line, level, event)
  if (level === 'error') console.error(output)
  else if (level === 'warn') console.warn(output)
  else console.info(output)
}

function safeErrorFields(error: unknown): LogFields {
  const fields: LogFields = {
    errorType:
      error instanceof Error && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(error.name)
        ? error.name
        : 'Error',
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code
    if (typeof code === 'string' && /^[A-Z0-9_-]{1,40}$/.test(code)) {
      fields.errorCode = code
    }
  }

  return fields
}

export function logServerEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  writeLog(level, event, fields)
}

export function logServerError(event: string, error: unknown, fields: LogFields = {}) {
  writeLog('error', event, { ...fields, ...safeErrorFields(error) })
}

async function logApiRequest(route: string, request: Request, handler: () => Promise<Response>) {
  const requestId = randomUUID()
  const startedAt = performance.now()

  let response: Response
  try {
    response = await handler()
  } catch (error) {
    logServerError('api.request.failed', error, {
      requestId,
      method: request.method,
      route,
    })
    throw error
  }

  if (request.method !== 'GET' || response.status >= 400) {
    const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info'
    writeLog(level, 'api.request.completed', {
      requestId,
      method: request.method,
      route,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    })
  }

  return response
}

export function withApiLogging(route: string, handler: (request: Request) => Promise<Response>) {
  return (request: Request) => logApiRequest(route, request, () => handler(request))
}

export function withContextApiLogging<TContext>(
  route: string,
  handler: (request: Request, context: TContext) => Promise<Response>,
) {
  return (request: Request, context: TContext) =>
    logApiRequest(route, request, () => handler(request, context))
}
