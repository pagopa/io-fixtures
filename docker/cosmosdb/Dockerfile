FROM node:16-alpine

WORKDIR /opt/cosmosdb

RUN npm install -g @zeit/cosmosdb-server@0.13.4 ts-node

CMD ["sh", "-c", "cosmosdb-server -p 3000"]
