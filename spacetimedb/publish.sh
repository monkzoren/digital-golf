#!/bin/sh
# One-shot publisher: waits for SpacetimeDB, becomes the deterministic owner
# identity (a token minted from the server's own signing key with FIXED
# claims — see mint-token.mjs), publishes the module, then idles so
# orchestrators see the stack as healthy. Same mechanism as Digital Tennis.
set -e
SERVER_URL="${SPACETIMEDB_URL:-http://spacetimedb:3000}"
DB_NAME="${DATABASE_NAME:-digital-golf}"
SERVER_KEY="${SERVER_KEY:-/stdb/keys/id_ecdsa}"
# Don't change once a database exists — a different issuer is a different
# identity, and it would no longer own the database.
MINT_ISSUER="digital-golf-publisher"

echo "Waiting for SpacetimeDB at $SERVER_URL ..."
until curl -sf "$SERVER_URL/v1/ping" > /dev/null 2>&1; do
  sleep 2
done

login_publisher() {
  if [ -n "$SPACETIME_TOKEN" ]; then
    echo "Logging in with SPACETIME_TOKEN ..."
    spacetime login --token "$SPACETIME_TOKEN"
    return
  fi
  tries=0
  while [ ! -f "$SERVER_KEY" ] && [ $tries -lt 5 ]; do
    tries=$((tries + 1)); sleep 1
  done
  if [ -f "$SERVER_KEY" ]; then
    echo "Minting deterministic publisher identity from the server key ..."
    TOKEN=$(node /mint-token.mjs "$SERVER_KEY" "$MINT_ISSUER" "$DB_NAME")
    spacetime login --token "$TOKEN"
  else
    echo "WARNING: server key not found at $SERVER_KEY — is the spacetimedb"
    echo "service started with --jwt-priv-key-path? Falling back to the"
    echo "identity saved in the publisher-creds volume."
  fi
}
login_publisher

echo "Publishing module '$DB_NAME' to $SERVER_URL as:"
spacetime login show || true

try_publish() {
  PUBLISH_OUT=$(spacetime publish "$DB_NAME" --server "$SERVER_URL" --module-path /module "$@" -y 2>&1)
  PUBLISH_RC=$?
  echo "$PUBLISH_OUT"
  return $PUBLISH_RC
}

clear_blocked() {
  echo
  echo "PUBLISH REJECTED, and clearing the database is NOT automatic."
  echo "This is almost always a BREAKING SCHEMA CHANGE (only APPENDED columns"
  echo "with defaults migrate automatically). Prefer fixing the schema."
  echo
  echo "To wipe and republish anyway: set ALLOW_CLEAR=1 on the publisher and"
  echo "redeploy. NOTE: player-made courses live in this database — export"
  echo "anything you care about first:"
  echo "  spacetime sql $DB_NAME 'SELECT * FROM course' > courses.bak"
  echo "  spacetime sql $DB_NAME 'SELECT * FROM hole' > holes.bak"
  exit 1
}

publish_failed() {
  echo
  echo "PUBLISH FAILED. If the error says 'not authorized ... update database',"
  echo "the database is owned by an identity this publisher cannot become."
  echo "Either set SPACETIME_TOKEN to the owner's token, or start over by"
  echo "deleting the spacetimedb-data volume (loses all game state)."
  exit 1
}

if ! try_publish; then
  if echo "$PUBLISH_OUT" | grep -q "InvalidSignature"; then
    echo "Server rejected the token (InvalidSignature) — re-minting and retrying..."
    rm -f /root/.config/spacetime/cli.toml
    login_publisher
    if ! try_publish; then
      [ -n "$ALLOW_CLEAR" ] || clear_blocked
      try_publish --clear-database || publish_failed
    fi
  else
    [ -n "$ALLOW_CLEAR" ] || clear_blocked
    echo "Publish rejected — ALLOW_CLEAR is set, clearing database and retrying..."
    try_publish --clear-database || publish_failed
  fi
fi
echo "Module published."
# Built-in courses are (re)seeded from code on every publish, so a tweak to
# shared/courses.ts reaches players without a wipe.
spacetime call "$DB_NAME" seed_builtins --server "$SERVER_URL" > /dev/null 2>&1 || true
echo "Publisher idle; module is live."
exec tail -f /dev/null
