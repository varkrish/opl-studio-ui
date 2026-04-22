# ─────────────────────────────────────────────────────────────────────────────
# OPL Studio UI — Frontend (React + PatternFly → Nginx)
# Podman / Docker compatible · Multi-stage build
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM registry.access.redhat.com/ubi9/nodejs-20:latest AS builder

LABEL org.opencontainers.image.title="OPL Studio UI"
LABEL org.opencontainers.image.description="React PatternFly UI for AI Software Development Crew"
LABEL org.opencontainers.image.vendor="Red Hat"

USER root
WORKDIR /build

COPY package.json package-lock.json* ./

RUN npm ci --ignore-scripts 2>/dev/null || npm install

COPY . ./

ENV VITE_API_URL=""
RUN npm run build


# ── Stage 2: Serve with Nginx ────────────────────────────────────────────────
FROM registry.access.redhat.com/ubi9/nginx-122:latest

LABEL org.opencontainers.image.title="OPL Studio UI"
LABEL org.opencontainers.image.description="React PatternFly UI served by Nginx"
LABEL org.opencontainers.image.vendor="Red Hat"

USER root

COPY --from=builder /build/dist /opt/app-root/src

COPY nginx.conf.template /etc/nginx/nginx.conf.template

ENV BACKEND_HOST=backend

RUN mkdir -p /tmp/client_body /tmp/proxy /tmp/fastcgi /tmp/uwsgi /tmp/scgi && \
    chown -R 1001:0 /opt/app-root/src /var/log/nginx /tmp /etc/nginx && \
    chmod -R g=u /opt/app-root/src /var/log/nginx /tmp /etc/nginx

USER 1001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8080/ || exit 1

CMD ["/bin/sh", "-c", "envsubst '${BACKEND_HOST}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
