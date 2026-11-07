import { z } from 'zod'
import { AssetValidationError } from '@/server/modules/assets'
import { getAssetService } from '@/lib/backend-services'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withApiLogging } from '@/lib/server-logger'
import { getAppSession, unauthenticatedResponse } from '@/lib/app-auth'

const captureModeSchema = z.enum(['first', 'current', 'last'])

async function captureFrame(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Frame upload form could not be read.' }, { status: 400 })
  }
  const sourceVideoAssetId = String(form.get('sourceVideoAssetId') || '')
  const captureMode = captureModeSchema.safeParse(form.get('captureMode'))
  const timestampSeconds = Number(form.get('timestampSeconds'))
  const file = form.get('file')
  if (
    !sourceVideoAssetId ||
    sourceVideoAssetId.length > 128 ||
    !captureMode.success ||
    !Number.isFinite(timestampSeconds) ||
    timestampSeconds < 0 ||
    !(file instanceof File)
  ) {
    return Response.json({ error: 'Choose a valid video frame to save.' }, { status: 400 })
  }

  try {
    const assetService = await getAssetService(session.user)
    const [source] = await assetService.findAssetsByIds([sourceVideoAssetId])
    if (!source || !source.mimeType?.startsWith('video/')) {
      return Response.json({ error: 'The source video is unavailable.' }, { status: 404 })
    }
    const media = await assetService.uploadAsset({
      alt: file.name || `video-frame-${captureMode.data}.png`,
      source: 'derived',
      derivedFrom: String(source.id),
      derivedMetadata: {
        action: 'capture-frame',
        captureMode: captureMode.data,
        timestampSeconds,
        sourceVideoAssetId: String(source.id),
      },
      file: {
        buffer: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: file.name || `video-frame-${captureMode.data}.png`,
        size: file.size,
      },
    })
    return Response.json({ media }, { status: 201 })
  } catch (error) {
    if (error instanceof AssetValidationError) {
      return Response.json({ error: error.message }, { status: error.statusCode })
    }
    return backendUnavailableResponse(error, '/api/studio/video-frames')
  }
}

export const POST = withApiLogging('/api/studio/video-frames', captureFrame)
