FROM node:20-alpine AS build
WORKDIR /app
# VITE_API_BASE is baked into the JS bundle at build time; pass it with
# `--build-arg VITE_API_BASE=https://api.example.com` or through the
# hosting provider's build-args UI. When unset, the app falls back to
# same-origin `/api` requests, which works under docker-compose where
# nginx reverse-proxies to the backend service.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE

COPY package.json ./
# Install without a lockfile is fine for a small demo; lock before prod.
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# nginx:alpine auto-envsubst's anything in /etc/nginx/templates into
# /etc/nginx/conf.d at boot, so $PORT from Render/Railway is honoured.
# The FILTER keeps substitution to PORT only, so nginx's own $uri/$host
# variables are left untouched.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV PORT=8080 \
    NGINX_ENVSUBST_FILTER=^PORT$
EXPOSE 8080
