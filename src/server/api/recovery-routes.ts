import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { SessionService } from '../auth/session-service.js'
import { requireCreatorSession } from './auth-routes.js'
import type { RecoveryReadService } from '../services/recovery-read-service.js'

const caseParamsSchema = z.object({ caseId: z.uuid() })

export function registerRecoveryRoutes(
  app: FastifyInstance,
  sessions: SessionService,
  reads: RecoveryReadService,
): void {
  app.get('/api/recovery-overview', async (request) => {
    const session = requireCreatorSession(request, sessions)
    return reads.overview(session)
  })

  app.get('/api/recovery-cases/:caseId', async (request) => {
    requireCreatorSession(request, sessions)
    const { caseId } = caseParamsSchema.parse(request.params)
    return reads.detail(caseId)
  })
}
