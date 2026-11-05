import type { Instrumentation } from 'next'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logServerEvent } = await import('./lib/server-logger')
    logServerEvent('info', 'app.server.started', {
      runtime: 'nodejs',
      environment: process.env.NODE_ENV ?? 'unknown',
    })
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { logServerError } = await import('./lib/server-logger')
  logServerError('next.request.failed', error, {
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  })
}
