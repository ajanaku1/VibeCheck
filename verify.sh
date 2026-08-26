#!/usr/bin/env bash
# VibeCheck — phase-tagged done predicates.
# Done means this script exits 0. The initial scaffold is expected to be red.

set -uo pipefail
cd "$(dirname "$0")"

FILTER="${1:-}"
pass=0
fail=0
executed=0

check() {
  local tag="$1" desc="$2"
  shift 2
  if [ -n "$FILTER" ] && [ "$tag" != "$FILTER" ]; then return 0; fi
  executed=$((executed + 1))
  if "$@" >/dev/null 2>&1; then
    printf '  PASS  [%s] %s\n' "$tag" "$desc"
    pass=$((pass + 1))
  else
    printf '  FAIL  [%s] %s\n' "$tag" "$desc"
    fail=$((fail + 1))
  fi
}

checksh() {
  local tag="$1" desc="$2" cmd="$3"
  check "$tag" "$desc" sh -c "$cmd"
}

echo "== VibeCheck verify =="

checksh phase-0 "formal contracts parse and contain no unresolved placeholders" \
  'jq empty specs/001-community-recovery/contracts/minds-analysis.schema.json && ruby -e "require '\''yaml'\''; YAML.load_file('\''specs/001-community-recovery/contracts/openapi.yaml'\'')" && ! rg -n "NEEDS CLARIFICATION|TKTK|TODO|\\?\\?\\?" specs/001-community-recovery/{spec.md,plan.md,data-model.md,tasks.md,contracts}'
checksh phase-0 "all implementation tasks use the strict checklist format" \
  'total=$(rg -c "^- \\[[ x]\\] T[0-9]{3}" specs/001-community-recovery/tasks.md) && valid=$(rg -c "^- \\[[ x]\\] T[0-9]{3}( \\[P\\])?( \\[US[0-9]+\\])? .+" specs/001-community-recovery/tasks.md) && test "$total" -eq 75 && test "$valid" -eq "$total"'

check phase-1 "TypeScript configuration and foundational unit tests pass" npm run test:unit -- config
check phase-1 "database and contract suites pass" npm run test:foundation
check phase-1 "live app webhook, stable Minds engine, and creator-only delivery are proven" npm run probe:live

check phase-2 "case, timing, conflict, and recovery unit suites pass" npm run test:recovery-unit
check phase-2 "webhook, durable worker, commands, deadlines, and notification suites pass" npm run test:recovery-integration
check phase-2 "Telegram-only canonical recovery rehearsal passes" npm run demo:rehearse -- --telegram-only

checksh brand-concept "written brand truth and human-approved art direction exist before mark generation" \
  'test -s brand/BRAND-TRUTH.md && test -s brand/ART-DIRECTION.md && rg -qi "^status:[[:space:]]*approved" brand/ART-DIRECTION.md && rg -qi "signature element" brand/ART-DIRECTION.md && rg -qi "forbidden" brand/ART-DIRECTION.md'
checksh brand-selection "exactly three primary candidates and one packaged selected winner exist" \
  'test -d brand/review && count=$(find brand/review -maxdepth 1 -type f \( -name "candidate-*.svg" -o -name "candidate-*.png" \) | wc -l | tr -d " ") && test "$count" -eq 3 && test -s brand/SELECTION.md && rg -qi "^selected_candidate:" brand/SELECTION.md && test -s brand/BRAND-TRUTH.md && { test -s brand/finals/logo.svg || test -s brand/finals/logo.png; }'
checksh ui-direction "the selected UI direction is recorded after the brand winner" \
  'test -s brand/SELECTION.md && test -s ai/design-progress.md && section=$(awk '\''/^## Phase 3/{capture=1; next} /^## Phase 4/{capture=0} capture'\'' ai/design-progress.md) && printf "%s\n" "$section" | rg -qi "Status:[[:space:]]*completed" && printf "%s\n" "$section" | rg -qi "Selected:[[:space:]]*(?!pending).+"'

check phase-3 "Telegram authentication and session suites pass" npm run test:auth
check phase-3 "dashboard API contract and privacy suites pass" npm run test:dashboard
check phase-3 "landing, authorization, overview, detail, and logout browser journey passes" npm run test:e2e -- creator-dashboard
checksh phase-3 "production client contains no generic analytics or mock-data import" \
  'test -d src/dashboard && ! rg -n "MOCK_DATA|health score|member archetype|weekly briefing|knowledge gap" src/dashboard --glob "*.ts" --glob "*.html"'

check phase-4 "failure matrix and provenance suites pass" npm run test:failure-integrity
check phase-4 "restart and webhook replay produce no duplicate semantic effects" npm run test:restart

check phase-5 "lint, complete automated suite, and production build pass" npm run verify
check phase-5 "accessibility and performance release gates pass" npm run test:release-gates
check phase-5 "live three-session Minds and Telegram acceptance gate passes" npm run verify:live-demo
checksh phase-5 "demo video duration is between 105 and 115 seconds" \
  'test -s video/vibecheck-demo.mp4 && seconds=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 video/vibecheck-demo.mp4) && awk -v s="$seconds" "BEGIN { exit !(s >= 105 && s <= 115) }"'
checksh phase-5 "documentation records successful convergence and non-secret verification" \
  'test -s README.md && test -s docs/verification.md && rg -q "Convergence: PASS" docs/verification.md && rg -q "Live demo: PASS" docs/verification.md'
checksh phase-5 "tracked sources contain no committed runtime secret file" \
  'test -d src && ! git ls-files | rg -q "(^|/)\\.env$|\\.(sqlite|sqlite3|db)$"'

echo
if [ "$executed" -eq 0 ]; then
  printf '  FAIL  [filter] no checks matched "%s"; executed 0 predicates\n' "$FILTER"
  fail=$((fail + 1))
fi
printf 'passed %d, failed %d\n' "$pass" "$fail"

cat <<'MANUAL'

manual:
  [ ] The brand concept was approved in words before any candidate mark was rendered.
  [ ] Exactly three primary marks were presented; they are genuinely different, isolated, and free of surveillance/moderation clichés.
  [ ] Only the selected primary mark produced derived assets, and its identity is recorded in the final brand truth.
  [ ] The three UI directions inherit the selected brand instead of retrofitting it after proposal generation.
  [ ] The selected visual direction is documented and the rendered mobile/desktop UI is coherent, legible, and recovery-focused.
  [ ] The staged walkthrough visibly discloses Demo Mode and uses genuine live Mind actions rather than rehearsal output.
  [ ] A first-time reviewer can explain that VibeCheck follows a fracture through intervention to creator-confirmed recovery.
  [ ] The creator personally performs outreach; no affected member receives a VibeCheck message.
  [ ] Public deployment, repository publication, and hackathon submission have explicit user approval.
MANUAL

[ "$fail" -eq 0 ] || exit 1
