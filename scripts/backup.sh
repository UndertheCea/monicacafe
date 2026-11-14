#!/bin/sh
# Nightly database backup (#220): pg_dump, encrypted with age, copied to a
# local directory or an S3 bucket, then pruned to 7 daily + 4 weekly dumps.
# Success and failure are reported (BACKUP_PING_URL) and a marker file records
# the last success, which the compose healthcheck reads (#289).
#
#   DATABASE_URL=postgres://… BACKUP_AGE_RECIPIENT=age1… BACKUP_TARGET=/backups ./scripts/backup.sh
#
# What it needs (the compose `backup` image has them: postgresql17-client, age, aws-cli):
#   DATABASE_URL         the database to dump (required).
#   BACKUP_AGE_RECIPIENT age PUBLIC key. The private key stays offline with the owner
#                        (docs/BACKUP.md). Unset: refused, unless BACKUP_ALLOW_PLAINTEXT=true
#                        (CI drill and dev only; the dump is then unencrypted).
#   BACKUP_TARGET        a local directory (/path or file:///path). Unset: S3, below.
#   BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY, and optionally
#   BACKUP_S3_ENDPOINT (non-AWS providers), BACKUP_S3_REGION, BACKUP_S3_PREFIX
#                        (default "monicacafe/"). Must not be the media bucket.
#   BACKUP_MEDIA=true    also mirror the image bucket (#288) to <target>/media/ or
#                        s3://BACKUP_S3_BUCKET/<prefix>media/. Source: S3_BUCKET, S3_ACCESS_KEY,
#                        S3_SECRET_KEY, S3_REGION and S3_INTERNAL_ENDPOINT (or S3_ENDPOINT),
#                        the same settings the API uses. Images are NOT age-encrypted (they
#                        are public already) and are never deleted from the backup when
#                        removed from the bucket: that is the undo for a bad cleanup. An S3
#                        target is fed through a local cache, BACKUP_MEDIA_CACHE
#                        (default /backups/.media-cache, keep it on a volume).
#   BACKUP_PING_URL      optional dead-man's switch, healthchecks.io style: GET on
#                        success, GET $BACKUP_PING_URL/fail on any failure. A failed
#                        ping only logs a warning; it never fails the backup.
#   BACKUP_MARKER        optional file that gets the epoch seconds of the last
#                        success (the compose healthcheck reads it).
#
# File names: monicacafe_YYYYMMDD_HHMMSS_<mon..sun>.dump[.age], in Taipei time.
# Retention, by date: the newest dump of each of the 7 most recent days that have
# one, plus the newest dump of each of the 4 most recent Sundays (Taipei). Extra
# dumps on one day (a restart with BACKUP_RUN_NOW) replace each other and never
# push older days out. A dump under 50 % of the previous one's size is still kept,
# but nothing is pruned, it logs loudly, pings /fail and exits 1 (an emptied
# database must not age the good dumps out).
# Exits non-zero on any failure and prints one JSON line at the end:
#   {"file":"…","bytes":N,"seconds":N,"pruned":N,"media_objects":N}  (-1 = media not mirrored)
# POSIX sh (runs in alpine); no tzdata needed, Taipei is a fixed UTC+8.
set -eu

keep_daily=7
keep_weekly=4

die() { echo "backup: $*" >&2; exit 1; }
say() { echo "backup: $*" >&2; }

ping() { # $1: "" (success) or "/fail"; best effort
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  url="${BACKUP_PING_URL%/}$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 10 --retry 3 -o /dev/null "$url" || say "warning: ping $1 failed"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 10 -O /dev/null "$url" || say "warning: ping $1 failed"
  else
    say "warning: BACKUP_PING_URL is set but neither curl nor wget exists"
  fi
}
# Any exit before the final line (die, a failing command, a signal) pings /fail.
work=""
finished=0
cleanup() {
  [ -z "$work" ] || rm -rf "$work"
  [ "$finished" = 1 ] || ping /fail
}
trap cleanup EXIT

# Keep the password out of the process list (ps): postgres://user:PASSWORD@host/db
# becomes PGPASSWORD plus a URL without it. (A URL-encoded password, with %, stays.)
pg_url="${DATABASE_URL:-}"
case "$pg_url" in
  postgres://*:*@*|postgresql://*:*@*)
    pw=$(printf %s "$pg_url" | sed -n 's|^postgres[a-z]*://[^:/@]*:\([^@/]*\)@.*|\1|p')
    case "$pw" in
      ""|*%*) ;;
      *)
        PGPASSWORD="$pw"; export PGPASSWORD
        pg_url=$(printf %s "$pg_url" | sed 's|^\(postgres[a-z]*://[^:/@]*\):[^@/]*@|\1@|')
        ;;
    esac
    ;;
esac

[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is not set"
recipient="${BACKUP_AGE_RECIPIENT:-}"
if [ -z "$recipient" ] && [ "${BACKUP_ALLOW_PLAINTEXT:-false}" != "true" ]; then
  die "BACKUP_AGE_RECIPIENT is not set; refusing an unencrypted dump (BACKUP_ALLOW_PLAINTEXT=true allows it, dev/CI only)"
fi

media="${BACKUP_MEDIA:-false}"
case "$media" in true|false) ;; *) die "BACKUP_MEDIA must be true or false, got '$media'" ;; esac
if [ "$media" = true ]; then
  media_endpoint="${S3_INTERNAL_ENDPOINT:-${S3_ENDPOINT:-}}"
  [ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ACCESS_KEY:-}" ] && [ -n "${S3_SECRET_KEY:-}" ] && [ -n "$media_endpoint" ] \
    || die "BACKUP_MEDIA=true needs S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY and S3_INTERNAL_ENDPOINT (or S3_ENDPOINT)"
fi

target="${BACKUP_TARGET:-}"
case "$target" in
  file://*) target="${target#file://}" ;;
esac
case "$target" in
  "") mode=s3 ;;
  /*) mode=local ;;
  *) die "BACKUP_TARGET must be an absolute path or file:///path (got '$target'); leave it empty for S3" ;;
esac

if [ "$mode" = s3 ]; then
  [ -n "${BACKUP_S3_BUCKET:-}" ] || die "set BACKUP_TARGET (local directory) or BACKUP_S3_BUCKET"
  [ -n "${BACKUP_S3_ACCESS_KEY:-}" ] && [ -n "${BACKUP_S3_SECRET_KEY:-}" ] || die "BACKUP_S3_ACCESS_KEY and BACKUP_S3_SECRET_KEY are required"
  # A different bucket from the media one: a bug or leaked key there must not reach the backups.
  [ "$BACKUP_S3_BUCKET" != "${S3_BUCKET:-}" ] || die "BACKUP_S3_BUCKET is the media bucket (S3_BUCKET); use a separate one"
  prefix="${BACKUP_S3_PREFIX-monicacafe/}"
  [ -z "$prefix" ] || case "$prefix" in */) ;; *) prefix="$prefix/" ;; esac
  export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
  export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
  export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"
  export AWS_EC2_METADATA_DISABLED=true
  export AWS_PAGER=""
  # Newer aws-cli sends extra checksums that some S3-compatible stores reject.
  export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
  export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
  aws_s3() { # aws with the optional custom endpoint
    if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"; else aws "$@"; fi
  }
else
  mkdir -p "$target"
fi

# --- storage operations: same three for a directory and a bucket -------------
store_list() { # file names, oldest first (names sort by date)
  if [ "$mode" = local ]; then
    find "$target" -maxdepth 1 -type f -name 'monicacafe_*.dump*' -exec basename {} \; | sort
  else
    aws_s3 s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix "$prefix" \
      --delimiter / --query 'Contents[].Key' --output text | tr '\t' '\n' | sed -e '/^None$/d' -e "s|^$prefix||" \
      | grep '^monicacafe_.*\.dump' | sort || true
  fi
}
store_put() { # local file, name
  if [ "$mode" = local ]; then
    cp "$1" "$target/.$2.partial" && mv "$target/.$2.partial" "$target/$2"
  else
    aws_s3 s3 cp --only-show-errors "$1" "s3://$BACKUP_S3_BUCKET/$prefix$2"
  fi
}
store_size() { # name -> bytes
  if [ "$mode" = local ]; then
    wc -c <"$target/$1" | tr -d ' '
  else
    aws_s3 s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "$prefix$1" --query ContentLength --output text
  fi
}
store_rm() { # name
  if [ "$mode" = local ]; then rm -f "$target/$1"; else aws_s3 s3 rm --only-show-errors "s3://$BACKUP_S3_BUCKET/$prefix$1"; fi
}

started=$(date +%s)
work=$(mktemp -d)
chmod 700 "$work"

# --- the media bucket (#288) ---------------------------------------------------
# Signed with the media credentials, never the backup ones, and in path style
# (SeaweedFS and most self-hosted stores have no <bucket>.host names).
media_aws() {
  AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
    AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" AWS_EC2_METADATA_DISABLED=true AWS_PAGER="" AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    AWS_CONFIG_FILE="$work/aws-media-config" aws --endpoint-url "$media_endpoint" "$@"
}
media_objects=-1
mirror_media() { # sets media_objects
  printf '[default]\ns3 =\n    addressing_style = path\n' >"$work/aws-media-config"
  if [ "$mode" = local ]; then
    dest="$target/media"
  else
    dest="${BACKUP_MEDIA_CACHE:-/backups/.media-cache}"
  fi
  mkdir -p "$dest" || return 1
  # No --delete: an image removed from the bucket (by a cleanup gone wrong, say)
  # stays in the backup.
  media_aws s3 sync --only-show-errors "s3://$S3_BUCKET" "$dest" || return 1
  if [ "$mode" = s3 ]; then
    aws_s3 s3 sync --only-show-errors "$dest" "s3://$BACKUP_S3_BUCKET/${prefix}media" || return 1
  fi
  media_objects=$(find "$dest" -type f | wc -l | tr -d ' ')
}

# Taipei is UTC+8 with no daylight saving: the POSIX zone "UTC-8" needs no tzdata.
stamp=$(TZ=UTC-8 date +%Y%m%d_%H%M%S)
dow=$(TZ=UTC-8 date +%a | tr 'A-Z' 'a-z')
name="monicacafe_${stamp}_${dow}.dump"

# Custom format: compressed, and pg_restore can pick parts out of it. Encrypted
# dumps are streamed into age: no plaintext copy is ever written. (POSIX sh has no
# pipefail, so pg_dump's exit status travels through a file.)
if [ -n "$recipient" ]; then
  { rc=0; pg_dump --format=custom --no-owner --dbname "$pg_url" || rc=$?; echo "$rc" >"$work/dump.rc"; } \
    | age -r "$recipient" -o "$work/$name.age"
  [ "$(cat "$work/dump.rc")" = 0 ] || die "pg_dump failed"
  name="$name.age"
else
  pg_dump --format=custom --no-owner --dbname "$pg_url" --file "$work/$name"
  say "WARNING: BACKUP_ALLOW_PLAINTEXT=true, this dump is not encrypted"
fi
bytes=$(wc -c <"$work/$name" | tr -d ' ')
[ "$bytes" -gt 0 ] || die "dump is empty"

# Size of the newest earlier dump, to catch a dump of an emptied database.
prev=$(store_list | grep '^monicacafe_[0-9]\{8\}_' | tail -n 1)
prev_bytes=0
[ -z "$prev" ] || prev_bytes=$(store_size "$prev")

store_put "$work/$name" "$name"

# --- retention ---------------------------------------------------------------
all=$(store_list)
echo "$all" | grep -qxF "$name" || die "uploaded $name but it is not in the store listing"
shrunk=0
if [ "$prev_bytes" -gt 0 ] && [ $((bytes * 2)) -lt "$prev_bytes" ]; then
  shrunk=1
  say "ERROR: $name is $bytes bytes, under 50% of the previous dump $prev ($prev_bytes bytes)."
  say "ERROR: the database may have been emptied. Kept the new dump, pruned NOTHING; check before the next run."
fi

# One dump per day (the newest of it) for the 7 latest days, and for the 4 latest
# Sundays. A name that doesn't parse as monicacafe_YYYYMMDD_... is never pruned.
newest_of_days() { # stdin: day list; $all: names
  while read -r d; do echo "$all" | grep "^monicacafe_${d}_" | tail -n 1; done
}
day_of() { sed -n 's/^monicacafe_\([0-9]\{8\}\)_.*/\1/p'; }
keep=$(
  {
    echo "$all" | grep -v '^monicacafe_[0-9]\{8\}_' || true
    echo "$all" | day_of | sort -u | tail -n "$keep_daily" | newest_of_days
    echo "$all" | grep '_sun\.dump' | day_of | sort -u | tail -n "$keep_weekly" | newest_of_days
  } | sed '/^$/d' | sort -u
)
echo "$keep" | grep -qxF "$name" || die "retention would drop the new dump $name; refusing to prune"
pruned=0
if [ "$shrunk" = 0 ]; then
  for f in $(echo "$all" | grep -vxF "$keep" || true); do
    store_rm "$f"
    pruned=$((pruned + 1))
  done
fi

# After the dump is stored and pruned, so a media failure never costs the database backup.
media_failed=false
if [ "$media" = true ]; then
  mirror_media || media_failed=true
fi

seconds=$(($(date +%s) - started))
printf '{"file":"%s","bytes":%s,"seconds":%s,"pruned":%s,"media_objects":%s}\n' "$name" "$bytes" "$seconds" "$pruned" "$media_objects"
if [ "$shrunk" = 1 ]; then exit 1; fi
[ "$media_failed" = false ] || die "the database was backed up but mirroring the media bucket FAILED"
if [ -n "${BACKUP_MARKER:-}" ]; then
  mkdir -p "$(dirname "$BACKUP_MARKER")"
  date +%s >"$BACKUP_MARKER.tmp" && mv "$BACKUP_MARKER.tmp" "$BACKUP_MARKER"
fi
finished=1
ping ""
