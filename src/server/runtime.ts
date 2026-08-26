interface RuntimeApp {
  listen(options: { port: number; host?: string }): Promise<unknown>
  close(): Promise<void>
}

interface RuntimeDatabase {
  close(): void
}

interface ServerRuntimeDependencies {
  drainObservations(): Promise<unknown>
  reconcileDeadlines(): Promise<unknown>
  drainNotifications(): Promise<unknown>
  app: RuntimeApp
  database: RuntimeDatabase
  pollIntervalMs: number
  onBackgroundError?: (error: unknown) => void
}

export class ServerRuntime {
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private stopped = false

  constructor(private readonly dependencies: ServerRuntimeDependencies) {
    if (dependencies.pollIntervalMs < 1) throw new Error('pollIntervalMs must be positive')
  }

  async start(options: { port: number; host?: string }): Promise<void> {
    await this.dependencies.app.listen(options)
    await this.runPersistedWork()
    this.pollTimer = setInterval(() => void this.runPersistedWork(), this.dependencies.pollIntervalMs)
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    if (this.pollTimer) clearInterval(this.pollTimer)
    await this.dependencies.app.close()
    this.dependencies.database.close()
  }

  private async runPersistedWork(): Promise<void> {
    const outcomes = await Promise.allSettled([
      this.dependencies.drainObservations(),
      this.dependencies.reconcileDeadlines(),
      this.dependencies.drainNotifications(),
    ])
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        this.report(outcome.reason)
      }
    }
  }

  private report(error: unknown): void {
    this.dependencies.onBackgroundError?.(error)
  }
}
