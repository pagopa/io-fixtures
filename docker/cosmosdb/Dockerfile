FROM node:16-alpine@sha256:a1f9d027912b58a7c75be7716c97cfbc6d3099f3a97ed84aa490be9dee20e787

WORKDIR /opt/cosmosdb

RUN npm install -g @zeit/cosmosdb-server@0.13.4 ts-node

CMD ["sh", "-c", "cosmosdb-server -p 3000"]
