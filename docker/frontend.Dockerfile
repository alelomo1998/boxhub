FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
# Copy build INPUTS explicitly, never `COPY frontend/ .`. That wildcard pulled in whatever else
# lived in the directory — including frontend/.angular, the Angular build cache, which reached
# 6.1 GB locally and produced a 6.55 GB layer on every build. .dockerignore now excludes it too;
# this is the second lock, so the same class of mistake cannot come back through a mis-edited
# ignore file. Add a line here when the build genuinely needs a new input.
COPY frontend/angular.json frontend/tsconfig*.json ./
COPY frontend/src ./src
COPY frontend/public ./public
RUN npm run build -- --configuration production

FROM nginx:1.31-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
# Templated (not conf.d directly): nginx.conf embeds ${BOXHUB_MEDIA_LINK_SECRET}, resolved by the
# image's built-in 20-envsubst-on-templates.sh entrypoint at container start into conf.d/default.conf.
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
# M11 T11: security headers snippet, included from nginx.conf. Not a template (no ${ENV_VAR}s),
# so it is copied straight to conf, not templates/.
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 80
