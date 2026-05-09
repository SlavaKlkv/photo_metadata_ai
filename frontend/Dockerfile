# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:stable-alpine

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]