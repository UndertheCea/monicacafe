# Image for the compose `backup` service and the CI restore drill (#220):
# scripts/backup.sh and scripts/restore.sh need pg_dump / pg_restore / psql 17
# (to match the postgres:17 server), age, and the AWS CLI for S3 targets.
FROM alpine:3.22
RUN apk add --no-cache postgresql17-client age aws-cli
# The scripts are mounted by docker-compose.yml, not copied: a script fix needs no rebuild.
WORKDIR /monicacafe
