FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
# Templated (not conf.d directly): nginx.conf embeds ${BOXHUB_MEDIA_LINK_SECRET}, resolved by the
# image's built-in 20-envsubst-on-templates.sh entrypoint at container start into conf.d/default.conf.
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
