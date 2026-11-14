#!/bin/sh
# CI restore drill, the real path (#289): runs inside the compose `backup` image
# against the dev SeaweedFS, with an age key made for the run.
#
#   backup_drill.sh backup    seed old dumps, run backup.sh (age + S3), check retention,
#                             the marker file and the healthcheck
#   backup_drill.sh restore   download the newest dump, decrypt and restore it with restore.sh
#
# Env (set by ci.yml): DATABASE_URL, BACKUP_AGE_RECIPIENT, BACKUP_S3_ENDPOINT,
# BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY, and for restore the
# private key as AGE_SECRET_KEY (one AGE-SECRET-KEY-… line).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
export AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true AWS_PAGER=""
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
prefix="monicacafe/"
s3() { aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"; }
names() { s3 s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix "$prefix" --query 'Contents[].Key' --output text | tr '\t' '\n' | sed -e '/^None$/d' | sort; }
fail() { echo "drill: FAIL $*" >&2; exit 1; }

case "${1:-}" in
backup)
  # 10 old daily dumps (1 byte each, so the size check has nothing to object to) and
  # a stray file: after the run, 7 days must remain (today + 6), the stray one stays.
  i=1
  while [ "$i" -le 10 ]; do
    day=$(TZ=UTC-8 date -d "@$(($(date +%s) - i * 86400))" +%Y%m%d)
    echo x | s3 s3 cp --only-show-errors - "s3://$BACKUP_S3_BUCKET/${prefix}monicacafe_${day}_030000_old.dump.age"
    i=$((i + 1))
  done
  echo x | s3 s3 cp --only-show-errors - "s3://$BACKUP_S3_BUCKET/${prefix}monicacafe_notadate.dump"

  export BACKUP_MARKER=/tmp/drill/last_success
  out=$(sh "$here/backup.sh" 2>&1) || { echo "$out"; fail "backup.sh failed"; }
  echo "$out"
  newest=$(names | grep '^'"$prefix"'monicacafe_[0-9]' | tail -n 1)
  case "$newest" in *.dump.age) ;; *) fail "newest object is not an encrypted dump: $newest" ;; esac
  [ "$(names | grep -c "$prefix"'monicacafe_[0-9]\{8\}_')" = 7 ] || { names; fail "retention should leave 7 daily dumps"; }
  names | grep -q 'monicacafe_notadate.dump' || fail "retention removed a file it could not parse"
  [ -s "$BACKUP_MARKER" ] || fail "no success marker written"
  mkdir -p /tmp/drill
  BACKUP_MARKER=$BACKUP_MARKER sh "$here/backup_healthcheck.sh" || fail "healthcheck fails right after a success"
  echo 1 >/tmp/drill/old
  BACKUP_MARKER=/tmp/drill/old sh "$here/backup_healthcheck.sh" 2>/dev/null && fail "healthcheck passes with an ancient marker"
  echo "drill: backup ok ($newest)"
  ;;
restore)
  newest=$(names | grep 'monicacafe_[0-9]\{8\}_[0-9]\{6\}_[a-z]*\.dump\.age$' | grep -v '_old\.dump' | tail -n 1)
  [ -n "$newest" ] || fail "no real dump in the bucket"
  umask 077
  mkdir -p /tmp/drill
  s3 s3 cp --only-show-errors "s3://$BACKUP_S3_BUCKET/$newest" /tmp/drill/dump.age
  printf '%s\n' "$AGE_SECRET_KEY" >/tmp/drill/identity
  BACKUP_AGE_IDENTITY=/tmp/drill/identity sh "$here/restore.sh" /tmp/drill/dump.age
  rm -rf /tmp/drill
  ;;
*)
  echo "usage: $0 backup|restore" >&2
  exit 2
  ;;
esac
