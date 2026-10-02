FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN ./node_modules/.bin/nest build process-service

FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY --from=builder /usr/src/app/dist/apps/process-service ./dist

CMD ["node", "dist/main.js"]
