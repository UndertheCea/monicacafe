#!/bin/sh
# Development S3-compatible image store: SeaweedFS (Apache-2.0). Runs inside the
# chrislusf/seaweedfs image, from docker-compose.yml and from CI.
#
#   seaweedfs.sh start   write the S3 identities file from env, then run
#                        master + volume + filer + S3 gateway (:8333)
#   seaweedfs.sh init    create the bucket if it doesn't exist (idempotent)
#
# Env: S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET (default media),
#      SEAWEED_HOST (init only; default seaweedfs)
#
# Anonymous callers may only GET objects under <bucket>/shops/ and
# <bucket>/coffees/ (no listing, no writes). Uploads are presigned PUTs that
# the API issues after checking ownership.
set -eu

BUCKET="${S3_BUCKET:-media}"

case "${1:-start}" in
start)
  : "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}" "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
  cat >/tmp/s3.json <<JSON
{
  "identities": [
    {
      "name": "moni",
      "credentials": [{ "accessKey": "$S3_ACCESS_KEY", "secretKey": "$S3_SECRET_KEY" }],
      "actions": ["Admin", "Read", "List", "Write", "Tagging"]
    },
    {
      "name": "anonymous",
      "actions": ["Read:$BUCKET/shops/*", "Read:$BUCKET/coffees/*"]
    }
  ]
}
JSON
  # The image's entrypoint drops to the seaweed user, which must read this.
  chmod 644 /tmp/s3.json
  exec /entrypoint.sh server -s3 -s3.port=8333 -s3.config=/tmp/s3.json
  ;;
init)
  host="${SEAWEED_HOST:-seaweedfs}"
  shell() { echo "$1" | weed shell -master="$host:9333" -filer="$host:8888" 2>&1; }
  # "already exists" on re-runs is fine; the list check below is the verdict.
  shell "s3.bucket.create -name $BUCKET" || true
  i=0
  until shell "s3.bucket.list" | grep -q "^  $BUCKET	"; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then echo "seaweedfs-init: bucket $BUCKET not found" >&2; exit 1; fi
    sleep 1
    shell "s3.bucket.create -name $BUCKET" >/dev/null || true
  done
  echo "seaweedfs-init: bucket $BUCKET ready"
  ;;
*)
  echo "usage: $0 start|init" >&2
  exit 2
  ;;
esac
