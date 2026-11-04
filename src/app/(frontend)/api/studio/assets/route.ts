import { getPayloadClient } from '@/lib/payload'

const allowedTypes = ['image/', 'video/', 'audio/', 'application/pdf']
const maxBytes = 50 * 1024 * 1024

export async function GET() {
  const payload = (await getPayloadClient()) as any
  const result = await payload.find({
    collection: 'media',
    overrideAccess: false,
    depth: 0,
    limit: 100,
    sort: '-createdAt',
  })
  return Response.json({ docs: result.docs })
}

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'Choose a media file to upload.' }, { status: 400 })
  }
  if (!allowedTypes.some((type) => file.type.startsWith(type))) {
    return Response.json({ error: 'This media type is not supported.' }, { status: 415 })
  }
  if (file.size > maxBytes) {
    return Response.json({ error: 'Media files must be 50 MB or smaller.' }, { status: 413 })
  }

  const payload = (await getPayloadClient()) as any
  const media = await payload.create({
    collection: 'media',
    overrideAccess: false,
    data: { alt: String(form.get('alt') || file.name) },
    file: {
      data: Buffer.from(await file.arrayBuffer()),
      mimetype: file.type,
      name: file.name,
      size: file.size,
    },
  })
  return Response.json({ media }, { status: 201 })
}
