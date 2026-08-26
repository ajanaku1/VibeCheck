import type { DatabaseSync } from 'node:sqlite'

import type { MindAnalysis } from '../../../domain/types.js'
import { assertObservationRefs } from './evidence-reference-policy.js'

export interface NewReasoningRun {
  id: string
  inputDigest: string
  analysisKind: 'baseline' | 'fracture' | 'recovery' | 'draft'
  engineAlias: string
  inputObservationIds: string[]
  startedAt: number
}

export interface ReasoningCompletion {
  status: 'succeeded' | 'timed_out' | 'invalid' | 'failed'
  response: MindAnalysis | null
  errorCode: string | null
  completedAt: number
}

interface ReasoningRow {
  id: string
  input_digest: string
  analysis_kind: NewReasoningRun['analysisKind']
  engine_alias: string
  input_observation_ids_json: string
  status: 'pending' | ReasoningCompletion['status']
  response_json: string | null
  error_code: string | null
  started_at: number
  completed_at: number | null
}

export interface StoredReasoningRun extends NewReasoningRun {
  status: ReasoningRow['status']
  response: MindAnalysis | null
  errorCode: string | null
  completedAt: number | null
}

export class ReasoningRunRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(run: NewReasoningRun): void {
    assertObservationRefs(this.database, run.inputObservationIds)
    this.database
      .prepare(
        `INSERT INTO reasoning_runs
         (id, input_digest, analysis_kind, engine_alias, input_observation_ids_json,
          status, started_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        run.id,
        run.inputDigest,
        run.analysisKind,
        run.engineAlias,
        JSON.stringify(run.inputObservationIds),
        run.startedAt,
      )
  }

  complete(id: string, completion: ReasoningCompletion): void {
    this.database
      .prepare(
        `UPDATE reasoning_runs
         SET status = ?, response_json = ?, error_code = ?, completed_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(
        completion.status,
        completion.response === null ? null : JSON.stringify(completion.response),
        completion.errorCode,
        completion.completedAt,
        id,
      )
  }

  findByInputDigest(inputDigest: string): StoredReasoningRun | null {
    const row = this.database
      .prepare(
        `SELECT id, input_digest, analysis_kind, engine_alias, input_observation_ids_json,
                status, response_json, error_code, started_at, completed_at
         FROM reasoning_runs WHERE input_digest = ?`,
      )
      .get(inputDigest) as ReasoningRow | undefined
    return row ? mapReasoningRun(row) : null
  }
}

function mapReasoningRun(row: ReasoningRow): StoredReasoningRun {
  return {
    id: row.id,
    inputDigest: row.input_digest,
    analysisKind: row.analysis_kind,
    engineAlias: row.engine_alias,
    inputObservationIds: JSON.parse(row.input_observation_ids_json) as string[],
    status: row.status,
    response: row.response_json ? (JSON.parse(row.response_json) as MindAnalysis) : null,
    errorCode: row.error_code,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}
