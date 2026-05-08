FROM node:20-alpine
RUN apk add --no-cache vips
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY src ./src
RUN mkdir -p /app/uploads
EXPOSE 3001
CMD ["node", "src/index.js"]
