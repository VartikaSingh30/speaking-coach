// Connect to MongoDB Atlas here
// For demo purposes, we'll use in-memory storage
// To enable MongoDB, uncomment and configure:

/*
import { MongoClient } from 'mongodb';

let client: MongoClient;
let db: any;

export async function connectMongo() {
  if (db) return db;
  
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('echo');
  
  console.log('Connected to MongoDB');
  return db;
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
*/

export function connectMongo() {
  console.log('Using in-memory storage (MongoDB disabled for demo)');
  return Promise.resolve({});
}
