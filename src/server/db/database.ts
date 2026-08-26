import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

function ensureParentDirectory(path: string): void {
  if (path === ':memory:') return
  mkdirSync(dirname(path), { recursive: true })
}

export function createDatabase(path: string): DatabaseSync {
  ensureParentDirectory(path)
  const database = new DatabaseSync(path, { timeout: 5_000 })
  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA journal_mode = WAL')
  return database
}

export function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
