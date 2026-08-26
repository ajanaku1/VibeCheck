import type { DatabaseSync } from 'node:sqlite'

export class CommunityStatusRepository {
  constructor(private readonly database: DatabaseSync) {}

  markObserving(communityId: string, observedAt: number): void {
    this.database
      .prepare(
        `UPDATE communities
         SET observation_status = 'observing', last_observed_at = ?, last_error = NULL
         WHERE id = ?`,
      )
      .run(observedAt, communityId)
  }

  markDelayed(communityId: string, errorCode: string): void {
    this.database
      .prepare(
        `UPDATE communities
         SET observation_status = 'delayed', last_error = ?
         WHERE id = ?`,
      )
      .run(errorCode, communityId)
  }
}
