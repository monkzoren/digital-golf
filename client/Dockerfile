# Build context is the REPO ROOT (the client imports spacetimedb/src/shared).
FROM node:22-alpine AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/tsconfig.json client/vite.config.ts client/index.html ./
COPY client/public ./public
COPY client/src ./src
COPY spacetimedb/src/shared /app/spacetimedb/src/shared
# Empty = same-origin (nginx proxies /v1 to SpacetimeDB).
ARG VITE_SPACETIMEDB_URI=
ARG VITE_DATABASE_NAME=digital-golf
# Firebase web config — the project SHARED by every Digital game. Public
# values; leave them empty to run without accounts (device-local identities).
ARG VITE_FIREBASE_API_KEY=
ARG VITE_FIREBASE_AUTH_DOMAIN=
ARG VITE_FIREBASE_PROJECT_ID=
ARG VITE_FIREBASE_APP_ID=
ENV VITE_SPACETIMEDB_URI=$VITE_SPACETIMEDB_URI \
    VITE_DATABASE_NAME=$VITE_DATABASE_NAME \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
