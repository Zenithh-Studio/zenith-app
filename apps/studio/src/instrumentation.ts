export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startStudioVideoGenerationWorker } =
    await import('./server/modules/studio/video-generation-worker')
  startStudioVideoGenerationWorker()
}
