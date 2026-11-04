export function backendUnavailableResponse() {
  return Response.json(
    {
      error: 'The data service is unavailable. Try again after the workspace backend is connected.',
    },
    { status: 503 },
  )
}
