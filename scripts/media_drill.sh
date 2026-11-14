#!/bin/sh
# CI restore drill helper (#288), run in the compose `backup` image after a
# BACKUP_MEDIA=true backup: delete ONE backed-up image from the live media
# bucket and print its key as the last line, so the drill can check that the
# image is gone, run scripts/restore_media.sh and check that it is back.
#
#   sh scripts/media_drill.sh [/backups/media]
#
# Needs S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_INTERNAL_ENDPOINT (or S3_ENDPOINT).
set -eu

dir="${1:-/backups/media}"
endpoint="${S3_INTERNAL_ENDPOINT:-${S3_ENDPOINT:-}}"
[ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ACCESS_KEY:-}" ] && [ -n "${S3_SECRET_KEY:-}" ] && [ -n "$endpoint" ] \
  || { echo "media_drill: S3_* settings are missing" >&2; exit 1; }

# A public image (the ones nginx serves), first in name order.
key=$(cd "$dir" && find shops coffees -type f 2>/dev/null | sort | head -n 1)
[ -n "$key" ] || { echo "media_drill: no shops/ or coffees/ image under $dir" >&2; exit 1; }

cfg=$(mktemp)
trap 'rm -f "$cfg"' EXIT
printf '[default]\ns3 =\n    addressing_style = path\n' >"$cfg"
AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" AWS_EC2_METADATA_DISABLED=true AWS_PAGER="" \
  AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  AWS_CONFIG_FILE="$cfg" \
  aws --endpoint-url "$endpoint" s3 rm --only-show-errors "s3://$S3_BUCKET/$key" >&2
echo "$key"
