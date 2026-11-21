# Two stages: build the static site, then serve it alongside the API from one
# small Node image. One container, one process, nothing else to run.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/data ./src/data
# Bookings and orders live here; mount a volume so they survive a redeploy.
VOLUME /app/data
EXPOSE 8787
CMD ["node", "server/index.js"]
