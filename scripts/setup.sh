#!/usr/bin/env bash
#
# Aether AI — Setup
#
# Does everything that can be automated, and stops with an exact instruction
# whenever it needs something only a human can provide (an account, a card, a
# terms-of-service acceptance).
#
# Safe to re-run: every step checks whether it is already done.
#
#   bash scripts/setup.sh
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'

step()  { echo; echo "${BOLD}$1${RESET}"; }
ok()    { echo "  ${GREEN}✓${RESET} $1"; }
warn()  { echo "  ${YELLOW}!${RESET} $1"; }
fail()  { echo "  ${RED}✗${RESET} $1"; }
note()  { echo "  ${DIM}$1${RESET}"; }

ask() {
  # ask <prompt> <varname> [secret]
  local prompt="$1" varname="$2" secret="${3:-}" value=""
  if [ -n "${!varname:-}" ]; then
    ok "$varname already set"
    return
  fi
  if [ -n "$secret" ]; then
    read -r -s -p "  $prompt: " value; echo
  else
    read -r -p "  $prompt: " value
  fi
  printf -v "$varname" '%s' "$value"
  export "${varname?}"
}

ENV_FILE="$REPO_ROOT/.env"

# ---------------------------------------------------------------------------
step "1. Checking prerequisites"
# ---------------------------------------------------------------------------

missing=0
for tool in node npm; do
  if command -v "$tool" >/dev/null 2>&1; then
    ok "$tool $(command "$tool" --version 2>/dev/null | head -1)"
  else
    fail "$tool is not installed"
    missing=1
  fi
done

if command -v psql >/dev/null 2>&1; then
  ok "psql available"
else
  warn "psql not found — needed to apply migrations"
  note "macOS: brew install libpq && brew link --force libpq"
  note "Ubuntu: sudo apt install postgresql-client"
fi

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 20 ]; then
  fail "Node 20 or newer is required (found $node_major)"
  missing=1
fi

[ "$missing" -eq 0 ] || { echo; fail "Install the missing tools above, then re-run."; exit 1; }

# ---------------------------------------------------------------------------
step "2. Installing dependencies and running the test suite"
# ---------------------------------------------------------------------------

npm ci --silent 2>/dev/null || npm install --silent
ok "dependencies installed"

if npm test >/tmp/aether-test.log 2>&1; then
  ok "$(grep -E '^# pass' /tmp/aether-test.log | head -1 | tr -d '#') unit tests passing"
else
  fail "unit tests failed — see /tmp/aether-test.log"
  exit 1
fi

# ---------------------------------------------------------------------------
step "3. Accounts you need to create"
# ---------------------------------------------------------------------------

cat <<'ACCOUNTS'
  These require a human: email verification, a card, and accepting terms.

    Supabase   https://supabase.com/dashboard    free    database + login
    Vercel     https://vercel.com/signup         free    hosting
    Anthropic  https://console.anthropic.com     paid    the employee's brain
    Resend     https://resend.com/signup         free    escalation emails
    Telegram   @BotFather in the Telegram app    free    phone alerts (optional)

  Only the first four are required. Create them, then continue.
ACCOUNTS
read -r -p "  Press enter once those exist (or Ctrl-C to stop here): " _

# ---------------------------------------------------------------------------
step "4. Collecting configuration"
# ---------------------------------------------------------------------------

if [ -f "$ENV_FILE" ]; then
  ok ".env already exists — loading it"
  set -a; . "$ENV_FILE"; set +a
fi

note "Supabase → Project Settings → Database → Connection string → Session pooler"
note "Use the SESSION pooler (port 5432), not the transaction pooler: the"
note "dashboard sets identity per transaction and needs a real session."
ask "DATABASE_URL" DATABASE_URL

note ""
note "Supabase → Project Settings → API. Your project ref is in the URL."
ask "Supabase project ref (e.g. abcdefghijklm)" SUPABASE_REF

note ""
note "console.anthropic.com → API keys"
ask "ANTHROPIC_API_KEY" ANTHROPIC_API_KEY secret

note ""
note "resend.com → API keys. The from-address domain must be verified with Resend."
ask "RESEND_API_KEY" RESEND_API_KEY secret
ask "NOTIFICATION_FROM (e.g. Aether AI <alerts@yourdomain.com>)" NOTIFICATION_FROM

note ""
note "Optional: free instant phone alerts. Message @BotFather, /newbot, paste the token."
note "Leave blank to skip — the dashboard will simply not offer Telegram."
ask "TELEGRAM_BOT_TOKEN (optional)" TELEGRAM_BOT_TOKEN secret

note ""
note "Domains allowed to embed the chat widget, comma separated."
ask "WIDGET_ALLOWED_ORIGINS" WIDGET_ALLOWED_ORIGINS

# Generated rather than asked for: a secret a human invents is usually weak,
# and this one guards a publicly reachable endpoint that drains the queue.
CRON_SECRET="${CRON_SECRET:-$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')}"
ok "generated CRON_SECRET"

ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-sonnet-4-6}"

cat > "$ENV_FILE" <<ENVEOF
DATABASE_URL=$DATABASE_URL
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
ANTHROPIC_MODEL=$ANTHROPIC_MODEL
SUPABASE_JWKS_URL=https://$SUPABASE_REF.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_ISSUER=https://$SUPABASE_REF.supabase.co/auth/v1
RESEND_API_KEY=$RESEND_API_KEY
NOTIFICATION_FROM=$NOTIFICATION_FROM
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
CRON_SECRET=$CRON_SECRET
WIDGET_ALLOWED_ORIGINS=$WIDGET_ALLOWED_ORIGINS
ENVEOF
chmod 600 "$ENV_FILE"
ok "wrote .env (permissions 600, and it is gitignored)"

# ---------------------------------------------------------------------------
step "5. Applying database migrations"
# ---------------------------------------------------------------------------

if ! command -v psql >/dev/null 2>&1; then
  fail "psql is required for this step"
  note "Install it, then re-run this script — earlier steps will be skipped."
  exit 1
fi

if ! psql "$DATABASE_URL" -tAc 'select 1' >/dev/null 2>&1; then
  fail "Could not connect with that DATABASE_URL"
  note "Check the password, and that you used the session pooler string."
  exit 1
fi
ok "connected to the database"

psql "$DATABASE_URL" -q -c 'create extension if not exists pgcrypto;' >/dev/null 2>&1

applied=0
for migration in supabase/migrations/*.sql; do
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$migration" >/tmp/aether-migrate.log 2>&1; then
    ok "applied $(basename "$migration")"
    applied=$((applied + 1))
  elif grep -q "already exists" /tmp/aether-migrate.log; then
    note "$(basename "$migration") already applied"
  else
    fail "$(basename "$migration") failed:"
    sed 's/^/      /' /tmp/aether-migrate.log | head -10
    exit 1
  fi
done
ok "$applied migration(s) applied"

# ---------------------------------------------------------------------------
step "6. Verifying tenant isolation actually works"
# ---------------------------------------------------------------------------

# This is the check worth running before any real customer data exists: it
# proves one business cannot read another's conversations.
EXPECTED_POLICY_TABLES=5
policy_count="$(psql "$DATABASE_URL" -tAc "
  select count(distinct tablename) from pg_policies
   where schemaname = 'public'
     and tablename in ('businesses','conversations','messages','knowledge_chunks','leads')
" 2>/dev/null | tr -d '[:space:]')"

if [ "${policy_count:-0}" -ge "$EXPECTED_POLICY_TABLES" ]; then
  ok "row level security is enforced on all $policy_count tenant tables"
else
  fail "only ${policy_count:-0} of $EXPECTED_POLICY_TABLES tenant tables have RLS policies"
  note "Do not put real customer data in this database until this passes."
  exit 1
fi

# ---------------------------------------------------------------------------
step "7. Creating your first business"
# ---------------------------------------------------------------------------

echo
note "Sign up through your app's Supabase Auth (or Supabase → Authentication →"
note "Users → Add user), then paste that user's UUID below."
ask "Your Supabase auth user id" AUTH_USER_ID
ask "Your business name" BUSINESS_NAME

BUSINESS_ID="$(psql "$DATABASE_URL" -tAc "
  insert into businesses (name) values ('${BUSINESS_NAME//\'/\'\'}') returning id;
" 2>/dev/null | tr -d '[:space:]')"

if [ -z "$BUSINESS_ID" ]; then
  fail "Could not create the business"
  exit 1
fi
ok "business created: $BUSINESS_ID"

psql "$DATABASE_URL" -q -c "
  insert into business_members (business_id, user_id)
  values ('$BUSINESS_ID', '$AUTH_USER_ID')
  on conflict do nothing;
" >/dev/null 2>&1 && ok "linked your account to it"

# ---------------------------------------------------------------------------
step "8. Deploying"
# ---------------------------------------------------------------------------

if ! command -v vercel >/dev/null 2>&1; then
  note "Installing the Vercel CLI…"
  npm install -g vercel --silent >/dev/null 2>&1 || {
    warn "Global install failed; using npx instead"
  }
fi

echo
note "Pushing your configuration to Vercel, then deploying."
note "The CLI will open a browser to log in the first time."
read -r -p "  Press enter to deploy (or Ctrl-C to stop and deploy manually): " _

VERCEL="vercel"
command -v vercel >/dev/null 2>&1 || VERCEL="npx vercel"

$VERCEL link --yes >/dev/null 2>&1 || true

while IFS='=' read -r key value; do
  [ -z "$key" ] && continue
  [ -z "$value" ] && continue
  printf '%s' "$value" | $VERCEL env add "$key" production --force >/dev/null 2>&1 \
    && ok "set $key" \
    || warn "could not set $key — add it in the Vercel dashboard"
done < "$ENV_FILE"

echo
$VERCEL --prod

# ---------------------------------------------------------------------------
step "Done — what to check"
# ---------------------------------------------------------------------------

cat <<'FINAL'
  1. Open /dashboard on your new deployment and sign in.
  2. Hire a receptionist, add one piece of knowledge (your opening hours),
     add a notification recipient, then set the employee to active.
  3. Embed the widget on a test page:

       <script src="https://YOUR-DEPLOYMENT/widget.js"
               data-employee-id="THE-EMPLOYEE-ID"
               data-api-base="https://YOUR-DEPLOYMENT"
               defer></script>

  4. Ask it your opening hours  → it should answer.
  5. Ask something you never taught it → it should REFUSE to guess, escalate,
     and appear in the dashboard.

  Step 5 is the one that matters. If it invents a plausible answer instead of
  escalating, the product's core safety property is broken and I want to know.

  Note: Vercel's free tier runs cron once a day, which is too slow for
  escalation alerts. Either upgrade, or point any external scheduler at
  POST /api/cron with header:  Authorization: Bearer <CRON_SECRET from .env>
FINAL
