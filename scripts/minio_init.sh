#!/bin/sh
# Creates the image bucket and makes uploaded images publicly readable.
# Run inside a minio/minio image (it ships `mc`): by the `minio-init` service in
# docker-compose.yml, and by CI. Idempotent.
#
#   MINIO_URL      e.g. http://minio:9000
#   S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET
set -eu

MINIO_URL="${MINIO_URL:-http://minio:9000}"
BUCKET="${S3_BUCKET:-media}"

i=0
until mc alias set moni "$MINIO_URL" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then echo "minio-init: MinIO not reachable at $MINIO_URL" >&2; exit 1; fi
  sleep 1
done

mc mb --ignore-existing "moni/$BUCKET"
# Anonymous GET on the image prefixes only (no listing, no writes). Uploads
# are presigned PUTs issued by the API after it checks ownership.
mc anonymous set download "moni/$BUCKET/shops"
mc anonymous set download "moni/$BUCKET/coffees"
echo "minio-init: bucket $BUCKET ready"
