import {
  normalizeProductionSheet,
  productionSheetNames,
  type ProductionSheet,
  type ProductionSheetName,
} from '@/lib/production-sheet'

export const runtime = 'nodejs'

const MAX_SHEET_BYTES = 1_500_000

function parseCsv(source: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
      continue
    }

    if (character === '"' && cell.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  if (rows[0]?.[0]?.startsWith('\uFEFF')) rows[0][0] = rows[0][0].slice(1)
  return rows
}

function spreadsheetIdFromLink(input: unknown) {
  if (typeof input !== 'string' || input.length > 2048) return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null
    const match =
      /^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,128})(?:\/(?:edit|view|preview))?\/?$/.exec(
        url.pathname,
      )
    return match?.[1] || null
  } catch {
    return null
  }
}

const tabCandidates: Record<ProductionSheetName, string[]> = {
  'Visual Bible': ['04 Visual Bible', 'Visual Bible'],
  'Shot Master': ['05 Shot Master', 'Shot Master'],
  'Image Prompt': ['06 Image Prompts', 'Image Prompts', 'Image Prompt'],
  'Motion Prompt': ['07 Motion Prompts', 'Motion Prompts', 'Motion Prompt'],
}

async function fetchSheetByTabName(
  spreadsheetId: string,
  tabName: string,
): Promise<ProductionSheet> {
  const url = new URL(
    `/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`,
    'https://docs.google.com',
  )
  url.search = new URLSearchParams({ tqx: 'out:csv', sheet: tabName })
    .toString()
    .replace(/\+/g, '%20')

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Google returned ${response.status}.`)
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_SHEET_BYTES) {
    throw new Error(`The tab exceeds the 1.5 MB import limit.`)
  }
  if (/^\s*(?:<!doctype html|<html|google\.visualization\.Query\.setResponse)/i.test(text)) {
    throw new Error('Google did not return CSV data.')
  }
  const rows = parseCsv(text)
  const headers = (rows.shift() || []).map((header) => header.trim())
  if (!headers.some(Boolean)) throw new Error('The tab is empty.')
  return { headers, rows: rows.filter((cells) => cells.some((value) => value.trim())) }
}

async function fetchSheet(spreadsheetId: string, name: ProductionSheetName) {
  let lastError: unknown
  for (const candidate of tabCandidates[name]) {
    try {
      return normalizeProductionSheet(name, await fetchSheetByTabName(spreadsheetId, candidate))
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `Could not read “${name}”. Expected a tab named “${tabCandidates[name].at(-1)}” (optionally with its numbered prefix). Check the tab name and viewer access${lastError instanceof Error ? `: ${lastError.message}` : '.'}`,
  )
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const spreadsheetId = spreadsheetIdFromLink(
    body && typeof body === 'object' ? (body as Record<string, unknown>).url : null,
  )
  if (!spreadsheetId) {
    return Response.json(
      { error: 'Paste a Google Sheets URL such as https://docs.google.com/spreadsheets/d/…/edit.' },
      { status: 400 },
    )
  }

  try {
    const sheets = await Promise.all(
      productionSheetNames.map(
        async (name) => [name, await fetchSheet(spreadsheetId, name)] as const,
      ),
    )
    return Response.json(
      { spreadsheetId, sheets: Object.fromEntries(sheets) },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The Google Sheet could not be imported. Check link access and tab names.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
