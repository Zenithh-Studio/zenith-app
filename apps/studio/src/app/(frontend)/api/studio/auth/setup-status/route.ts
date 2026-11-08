import { getPayloadClient } from '@/lib/payload'
import { backendUnavailableResponse } from '@/lib/backend-api-response'
import { withApiLogging } from '@/lib/server-logger'

async function getSetupStatus() {
  if (!process.env.APP_ADMIN_SETUP_TOKEN) return Response.json({ adminSetupAvailable: false })
  try {
    const payload = await getPayloadClient()
    const setup = await payload.find({
      collection: 'admin-setup',
      overrideAccess: true,
      limit: 1,
      where: { setupKey: { equals: 'initial-admin' } },
    })
    return Response.json({ adminSetupAvailable: setup.docs.length === 0 })
  } catch (error) {
    return backendUnavailableResponse(error, '/api/studio/auth/setup-status')
  }
}

export const GET = withApiLogging('/api/studio/auth/setup-status', getSetupStatus)
