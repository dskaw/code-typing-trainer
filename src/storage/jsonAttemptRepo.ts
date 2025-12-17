import fs from 'node:fs/promises'
import path from 'node:path'
import type { Attempt } from '../shared/types'
import type { AttemptRepo } from './attemptRepo'

type StoredAttemptsV1 = {
  schemaVersion: 1
  attempts: Attempt[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function coerceStored(json: unknown): StoredAttemptsV1 {
  if (Array.isArray(json)) return { schemaVersion: 1, attempts: json as Attempt[] }
  if (isRecord(json) && Array.isArray(json.attempts)) {
    return { schemaVersion: 1, attempts: json.attempts as Attempt[] }
  }
  return { schemaVersion: 1, attempts: [] }
}

async function readJson(filePath: string): Promise<StoredAttemptsV1> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return coerceStored(JSON.parse(raw))
  } catch (error: unknown) {
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : null
    if (code === 'ENOENT') return { schemaVersion: 1, attempts: [] }
    return { schemaVersion: 1, attempts: [] }
  }
}

async function writeJsonAtomic(filePath: string, data: StoredAttemptsV1): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const tmp = `${filePath}.tmp`
  const raw = JSON.stringify(data, null, 2)
  await fs.writeFile(tmp, raw, 'utf8')
  await fs.copyFile(tmp, filePath)
  await fs.rm(tmp, { force: true })
}

export function createJsonAttemptRepo(filePath: string): AttemptRepo {
  return {
    async add(attempt) {
      const stored = await readJson(filePath)
      if (stored.attempts.some((a) => a.id === attempt.id)) return
      stored.attempts.push(attempt)
      await writeJsonAtomic(filePath, stored)
    },
    async list() {
      const stored = await readJson(filePath)
      return stored.attempts.slice().sort((a, b) => (b.endAtMs - a.endAtMs))
    },
  }
}
