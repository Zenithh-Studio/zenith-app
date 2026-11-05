export function backendUnavailableResponse() {
  return Response.json(
    {
      error: 'The data service is unavailable. Check the PostgreSQL connection and try again.',
    },
    { status: 503 },
  )
}
