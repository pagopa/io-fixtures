# io-fixtures

Adds some test data to cosmosdb database.

```
cp env.example .env
# modify .env
yarn install
yarn start
```

## NOTES
- Ensure your hosts file has cosmosdb bound to 127.0.0.1
- Ensure cosmosdb variables are the same in both `.env` and `docker/cosmosdb/env-cosmosdb` files

## Run with docker
Simply run `yarn docker:start` to start storage and cosmosdb emulators.
Then, simply run the project with yarn start and wait for it to finish, any error will kill the application after a message 
has been displayed to stdout
