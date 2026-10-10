#!/bin/sh
# Bring the database schema up to date before anything starts, so a deploy that adds
# columns can't break pages ("Failed to load ..."). migrate.py only adds what's missing,
# so running it on every start is safe. Retries while the DB container is still booting;
# if it still fails, the site starts anyway and the error is in the container log.
cd /app/backend

attempt=1
until python migrate.py; do
  if [ "$attempt" -ge 5 ]; then
    echo "WARNING: migrate.py failed after $attempt attempts — starting anyway, check the log above"
    break
  fi
  echo "migrate.py failed (attempt $attempt), retrying in 5s..."
  attempt=$((attempt + 1))
  sleep 5
done

exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
