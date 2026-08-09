#!/bin/sh
# Guarded frontend deploy. Cloudflare Pages here is direct-upload, so whatever
# sits in the working directory is exactly what users get. These checks exist
# because the real config lives in a tracked file that must stay uncommitted,
# which makes it easy to lose to a stray checkout/stash and deploy placeholders.
set -eu

cd "$(dirname "$0")/.."
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$1"; }

# 1. Refuse to ship placeholder config — this breaks every API call and sign-in.
if grep -q 'YOUR_APPS_SCRIPT_URL_HERE\|YOUR_GOOGLE_CLIENT_ID_HERE' index.html; then
  fail "index.html still has placeholder config — restore the real GOOGLE_CLIENT_ID and SCRIPT_URL before deploying."
fi
ok "index.html has real config"

# 2. Refuse if the real config has been staged or committed (repo is public).
if git show HEAD:index.html 2>/dev/null | grep -q 'script\.google\.com/macros/s/'; then
  fail "HEAD:index.html contains a real SCRIPT_URL — it must never be committed. Fix the commit before deploying."
fi
if git diff --cached --quiet -- index.html 2>/dev/null; then :; else
  if git diff --cached index.html | grep -q '^+.*script\.google\.com/macros/s/'; then
    fail "Staged index.html contains a real SCRIPT_URL — unstage it before deploying."
  fi
fi
ok "committed index.html carries placeholders only"

# 3. Secret scan across everything that will be uploaded.
if git ls-files -co --exclude-standard \
   | grep -vE '^(scripts/|docs/|\.github/|README|SECURITY|LICENSE|CLAUDE)' \
   | xargs grep -lE 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}|[0-9]{8,}:AA[A-Za-z0-9_-]{30,}' \
   2>/dev/null | grep . ; then
  fail "Possible secret found in the files listed above."
fi
ok "secret scan clean"

# 4. Service-worker sanity: any change under css/, js/ or i18n/ since the last
#    deploy tag needs a CACHE bump, or installed PWAs keep the old code.
printf '  service worker: %s\n' "$(grep -o "buncheengern-v[0-9.]*" service-worker.js)"

printf '\nDeploying…\n'
# "$@" passes through extra flags (e.g. --branch=main when deploying from a
# worktree, whose git branch isn't main — wrangler infers the deploy target
# from the branch name and would otherwise ship a preview, not production).
npx wrangler pages deploy . --commit-dirty=true "$@"
