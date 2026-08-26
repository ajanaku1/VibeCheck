export type TimingProfile = 'demo' | 'standard'
export type DeadlineKind = 'silence' | 'dismissalCooling' | 'unresolved'

export interface TimingProfileDurations {
  silenceMs: number
  dismissalCoolingMs: number
  unresolvedMs: number
}

export const TIMING_PROFILES: Record<TimingProfile, TimingProfileDurations> = {
  demo: {
    silenceMs: 90_000,
    dismissalCoolingMs: 180_000,
    unresolvedMs: 600_000,
  },
  standard: {
    silenceMs: 48 * 60 * 60 * 1_000,
    dismissalCoolingMs: 24 * 60 * 60 * 1_000,
    unresolvedMs: 7 * 24 * 60 * 60 * 1_000,
  },
}

const DURATION_KEYS: Record<DeadlineKind, keyof TimingProfileDurations> = {
  silence: 'silenceMs',
  dismissalCooling: 'dismissalCoolingMs',
  unresolved: 'unresolvedMs',
}

export function deadlineFor(
  profile: TimingProfile,
  kind: DeadlineKind,
  anchorMs: number,
): number {
  return anchorMs + TIMING_PROFILES[profile][DURATION_KEYS[kind]]
}

export function isDeadlineReached(deadlineMs: number, nowMs: number): boolean {
  return nowMs >= deadlineMs
}
