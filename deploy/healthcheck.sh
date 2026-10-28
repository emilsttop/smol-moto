#!/bin/sh
# cron: */5 * * * * /srv/moto-smolensk/deploy/healthcheck.sh
# Если API не отвечает, перезапускаем и пишем в системный журнал.
if ! curl -fsS --max-time 5 http://127.0.0.1:8787/api/health >/dev/null; then
  logger -t moto-smolensk "api health failed, restarting"
  systemctl restart moto-smolensk-api
fi
