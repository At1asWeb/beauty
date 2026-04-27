FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
# Install without a lockfile is fine for a small demo; lock before prod.
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
