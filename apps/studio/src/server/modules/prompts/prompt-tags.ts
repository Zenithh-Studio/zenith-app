import { randomUUID } from 'node:crypto'

export function promptTagsToJson(tags?: string[]) {
  return tags?.map((tag) => ({ id: randomUUID(), tag }))
}
