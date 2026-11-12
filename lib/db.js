import { MongoClient } from 'mongodb';

let cachedClient = null;
let cachedPromise = null;

export async function getDb(dbName = 'vmo_tst') {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI chưa được thiết lập');
  }

  if (cachedClient) {
    return cachedClient.db(dbName);
  }

  if (!cachedPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10
    });

    cachedPromise = client.connect().then(connectedClient => {
      cachedClient = connectedClient;
      return connectedClient;
    });
  }

  const client = await cachedPromise;
  return client.db(dbName);
}
