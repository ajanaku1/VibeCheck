import type {
  ClaimedObservationWork,
  ObservationWorkRepository,
} from '../db/repositories/observation-work-repository.js'

interface ObservationHandler {
  handle(observationId: string): Promise<unknown>
}

interface ObservationWorkerDependencies {
  work: ObservationWorkRepository
  community: ObservationHandler
  creator: ObservationHandler
  maxJobsPerDrain?: number
  now?: () => number
  onError?: (error: unknown, observationId: string) => void
}

interface DrainResult {
  completed: number
  failed: number
}

export class ObservationWorker {
  private readonly maxJobsPerDrain: number
  private readonly now: () => number

  constructor(private readonly dependencies: ObservationWorkerDependencies) {
    this.maxJobsPerDrain = dependencies.maxJobsPerDrain ?? 50
    this.now = dependencies.now ?? Date.now
    if (this.maxJobsPerDrain < 1) throw new Error('maxJobsPerDrain must be positive')
  }

  async drain(): Promise<DrainResult> {
    const result: DrainResult = { completed: 0, failed: 0 }
    for (let index = 0; index < this.maxJobsPerDrain; index += 1) {
      const work = this.dependencies.work.claimNext(this.now())
      if (!work) break
      if (await this.process(work)) result.completed += 1
      else result.failed += 1
    }
    return result
  }

  private async process(work: ClaimedObservationWork): Promise<boolean> {
    try {
      const handler =
        work.kind === 'community'
          ? this.dependencies.community
          : this.dependencies.creator
      await handler.handle(work.observationId)
      this.dependencies.work.complete(work.observationId, this.now())
      return true
    } catch (error) {
      const retryAt = this.now() + retryDelay(work.attemptCount)
      this.dependencies.work.retry(
        work.observationId,
        retryAt,
        'observation_processing_failed',
      )
      this.dependencies.onError?.(error, work.observationId)
      return false
    }
  }
}

function retryDelay(attemptCount: number): number {
  return Math.min(2 ** Math.max(0, attemptCount - 1) * 1_000, 60_000)
}
