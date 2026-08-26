import type { DatabaseSync } from 'node:sqlite'

const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  telegram_chat_ref TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  minds_source_alias TEXT NOT NULL UNIQUE,
  observation_status TEXT NOT NULL CHECK (observation_status IN ('learning', 'observing', 'delayed', 'error')),
  timing_profile TEXT NOT NULL CHECK (timing_profile IN ('demo', 'standard')),
  last_observed_at INTEGER,
  last_error TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS creator_identities (
  telegram_user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  username TEXT,
  photo_url TEXT,
  last_authenticated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT NOT NULL REFERENCES creator_identities(telegram_user_id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS member_references (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id),
  external_ref_hash TEXT NOT NULL,
  display_label TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  activity_count INTEGER NOT NULL DEFAULT 0 CHECK (activity_count >= 0),
  UNIQUE (community_id, external_ref_hash)
) STRICT;

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id),
  source TEXT NOT NULL CHECK (source IN (
    'telegram_webhook_group', 'telegram_webhook_creator',
    'minds_telegram_group', 'minds_creator_chat', 'scheduler'
  )),
  source_fingerprint TEXT UNIQUE,
  session_ref TEXT NOT NULL,
  member_ref_id TEXT REFERENCES member_references(id),
  occurred_at INTEGER NOT NULL,
  ingested_at INTEGER NOT NULL,
  evidence_excerpt TEXT NOT NULL CHECK (length(evidence_excerpt) <= 500),
  content_digest TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('internal', 'case_evidence'))
) STRICT;

CREATE TABLE IF NOT EXISTS community_context (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id),
  kind TEXT NOT NULL CHECK (kind IN ('norm', 'relationship')),
  statement TEXT NOT NULL CHECK (length(statement) BETWEEN 1 AND 500),
  member_refs_json TEXT NOT NULL,
  evidence_observation_ids_json TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  created_at INTEGER NOT NULL,
  superseded_at INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS reasoning_runs (
  id TEXT PRIMARY KEY,
  input_digest TEXT NOT NULL UNIQUE,
  analysis_kind TEXT NOT NULL CHECK (analysis_kind IN ('baseline', 'fracture', 'recovery', 'draft')),
  engine_alias TEXT NOT NULL,
  input_observation_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'timed_out', 'invalid', 'failed')),
  response_json TEXT,
  error_code TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS recovery_cases (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id),
  fracture_key TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('escalating_conflict', 'post_conflict_silence')),
  state TEXT NOT NULL CHECK (state IN ('needs_review', 'monitoring', 'recovery_detected', 'resolved', 'unresolved', 'dismissed')),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  uncertainty TEXT NOT NULL CHECK (length(uncertainty) BETWEEN 1 AND 500),
  opened_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  monitoring_started_at INTEGER,
  resolution_due_at INTEGER,
  dismissed_until INTEGER,
  outcome_summary TEXT,
  version INTEGER NOT NULL CHECK (version >= 1)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_case_per_fracture
ON recovery_cases(community_id, fracture_key)
WHERE state IN ('needs_review', 'monitoring', 'recovery_detected');

CREATE TABLE IF NOT EXISTS case_participants (
  case_id TEXT NOT NULL REFERENCES recovery_cases(id),
  member_ref_id TEXT NOT NULL REFERENCES member_references(id),
  role TEXT NOT NULL CHECK (role IN ('affected', 'counterparty')),
  PRIMARY KEY (case_id, member_ref_id, role)
) STRICT;

CREATE TABLE IF NOT EXISTS case_evidence (
  case_id TEXT NOT NULL REFERENCES recovery_cases(id),
  evidence_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('observation', 'community_context')),
  role TEXT NOT NULL CHECK (role IN ('observed_change', 'remembered_context', 'escalation_indicator', 'silence_signal', 'return_signal', 'constructive_interaction')),
  PRIMARY KEY (case_id, evidence_id, role)
) STRICT;

CREATE TABLE IF NOT EXISTS intervention_plans (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES recovery_cases(id),
  suggested_text TEXT NOT NULL CHECK (length(suggested_text) BETWEEN 1 AND 2000),
  final_text TEXT CHECK (final_text IS NULL OR length(final_text) BETWEEN 1 AND 2000),
  finalized_by TEXT CHECK (finalized_by IS NULL OR finalized_by IN ('approve', 'edit')),
  finalized_at INTEGER,
  sent_confirmed_at INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id),
  idempotency_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('community_member', 'mind', 'creator', 'system', 'external_service')),
  provenance TEXT NOT NULL CHECK (provenance IN ('observation', 'remembered_context', 'mind_inference', 'creator_decision', 'external_operation')),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  evidence_refs_json TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  UNIQUE (case_id, idempotency_key)
) STRICT;

CREATE TRIGGER IF NOT EXISTS case_events_no_update
BEFORE UPDATE ON case_events
BEGIN
  SELECT RAISE(ABORT, 'case_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS case_events_no_delete
BEFORE DELETE ON case_events
BEGIN
  SELECT RAISE(ABORT, 'case_events are append-only');
END;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  case_event_id TEXT NOT NULL REFERENCES case_events(id),
  kind TEXT NOT NULL CHECK (kind IN ('initial_alert', 'final_copy', 'recovery_confirmation', 'command_help', 'delay_notice')),
  recipient_telegram_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  payload_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'unknown', 'failed')),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  telegram_message_id TEXT,
  last_attempt_at INTEGER,
  last_error_code TEXT,
  UNIQUE (case_event_id, kind)
) STRICT;

CREATE TABLE IF NOT EXISTS ingestion_cursors (
  alias TEXT PRIMARY KEY,
  last_fingerprint TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS scheduled_deadlines (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('silence', 'cooling', 'unresolved')),
  case_id TEXT REFERENCES recovery_cases(id),
  due_at INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at INTEGER,
  last_error_code TEXT,
  completed_at INTEGER,
  CHECK (kind = 'silence' OR case_id IS NOT NULL)
) STRICT;
`

const OBSERVATION_JOBS_SCHEMA = `
CREATE TABLE IF NOT EXISTS observation_jobs (
  observation_id TEXT PRIMARY KEY REFERENCES observations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('community', 'creator')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER,
  last_error_code TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS observation_jobs_pending
ON observation_jobs(status, available_at, observation_id);
`

export function migrate(database: DatabaseSync): void {
  database.exec(INITIAL_SCHEMA)
  migrateObservationSources(database)
  database.exec(OBSERVATION_JOBS_SCHEMA)
}

function migrateObservationSources(database: DatabaseSync): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'observations'")
    .get() as { sql: string } | undefined
  if (row?.sql.includes('telegram_webhook_group')) return

  database.exec(`
    ALTER TABLE observations RENAME TO observations_legacy;
    CREATE TABLE observations (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL REFERENCES communities(id),
      source TEXT NOT NULL CHECK (source IN (
        'telegram_webhook_group', 'telegram_webhook_creator',
        'minds_telegram_group', 'minds_creator_chat', 'scheduler'
      )),
      source_fingerprint TEXT UNIQUE,
      session_ref TEXT NOT NULL,
      member_ref_id TEXT REFERENCES member_references(id),
      occurred_at INTEGER NOT NULL,
      ingested_at INTEGER NOT NULL,
      evidence_excerpt TEXT NOT NULL CHECK (length(evidence_excerpt) <= 500),
      content_digest TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('internal', 'case_evidence'))
    ) STRICT;
    INSERT INTO observations
    SELECT * FROM observations_legacy;
    DROP TABLE observations_legacy;
  `)
}
