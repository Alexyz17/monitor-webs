FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
# Carpetas de datos con dueño "node" para que los volúmenes nuevos hereden los permisos.
RUN mkdir -p /data /status && chown node:node /data /status
ENV NODE_ENV=production \
    CONFIG_PATH=/config/sites.json \
    STATE_PATH=/data/state.json \
    STATUS_PAGE_PATH=/status/index.html
USER node
CMD ["node", "src/index.js"]
