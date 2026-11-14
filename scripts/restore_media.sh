#!/bin/sh
# Copies backed-up images (made by BACKUP_MEDIA=true in scripts/backup.sh, #288)
# back into the media bucket.
#
#   S3_BUCKET=media S3_ACCESS_KEY=… S3_SECRET_KEY=… S3_INTERNAL_ENDPOINT=http://seaweedfs:8333 \
#     ./scripts/restore_media.sh /backups/media
#   … BACKUP_S3_BUCKET=… BACKUP_S3_ACCESS_KEY=… BACKUP_S3_SECRET_KEY=… [BACKUP_S3_ENDPOINT=…] \
#     ./scripts/restore_media.sh s3://BACKUP_BUCKET/monicacafe/media
#
# The argument is a directory (a BACKUP_TARGET's media/ folder, or the S3 target's
# cache) or an s3:// URL in the backup bucket, which is downloaded first with the
# BACKUP_S3_* credentials. The destination is the bucket the API uses: S3_BUCKET,
# S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION and S3_INTERNAL_ENDPOINT (or S3_ENDPOINT).
# It only adds and overwrites objects (never deletes), so it is safe to run on a
# live bucket, and to run again. Object keys are random per upload, so an
# existing key is the same image. Prints the number of objects restored as JSON.
# POSIX sh; needs the AWS CLI (the compose `backup` image has it).
set -eu

die() { echo "restore_media: $*" >&2; exit 1; }

[ $# -eq 1 ] || die "usage: restore_media.sh <directory or s3://bucket/prefix/media>"
src="$1"
endpoint="${S3_INTERNAL_ENDPOINT:-${S3_ENDPOINT:-}}"
[ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ACCESS_KEY:-}" ] && [ -n "${S3_SECRET_KEY:-}" ] && [ -n "$endpoint" ] \
  || die "set S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY and S3_INTERNAL_ENDPOINT (or S3_ENDPOINT): where the images go"

work=$(mktemp -d)
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
printf '[default]\ns3 =\n    addressing_style = path\n' >"$work/aws-config"

case "$src" in
  s3://*)
    [ -n "${BACKUP_S3_ACCESS_KEY:-}" ] && [ -n "${BACKUP_S3_SECRET_KEY:-}" ] || die "BACKUP_S3_ACCESS_KEY and BACKUP_S3_SECRET_KEY are needed to read $src"
    mkdir -p "$work/media"
    AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY" \
      AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}" AWS_EC2_METADATA_DISABLED=true AWS_PAGER="" AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
      aws ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} s3 sync --only-show-errors "$src" "$work/media"
    src="$work/media"
    ;;
  /*) ;;
  *) die "the source must be an absolute directory or an s3:// URL, got '$src'" ;;
esac
[ -d "$src" ] || die "no such directory: $src"
count=$(find "$src" -type f | wc -l | tr -d ' ')
[ "$count" -gt 0 ] || die "$src holds no files; nothing to restore"

AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" AWS_EC2_METADATA_DISABLED=true AWS_PAGER="" AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  AWS_CONFIG_FILE="$work/aws-config" \
  aws --endpoint-url "$endpoint" s3 sync --only-show-errors "$src" "s3://$S3_BUCKET"
printf '{"restored_objects":%s}\n' "$count"
