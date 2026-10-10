FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx supervisor && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./

COPY backend/nginx.conf /etc/nginx/sites-available/default
COPY backend/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

# run DB migrations on every start, then nginx + API + courier worker
RUN chmod +x /app/backend/docker-entrypoint.sh
CMD ["/app/backend/docker-entrypoint.sh"]
