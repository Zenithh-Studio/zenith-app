import { logServerError } from './server-logger'

export function backendUnavailableResponse(error?: unknown, route = 'unknown') {
  if (error !== undefined) logServerError('backend.unavailable', error, { route })

  return Response.json(
    {
      error: 'The data service is unavailable. Check the PostgreSQL connection and try again.',
    },
    { status: 503 },
  )
}
