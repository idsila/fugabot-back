require('dotenv').config();
const { MongoClient } = require("mongodb");

const uri = process.env.URI;
const client = new MongoClient(uri);

const db =  client.db('test');
const users =  db.collection('users_fugabot');

async function clearCollection() {
  try {
    await collection.drop();
    console.log(`Удаление документов`);
  } finally {
    await client.close();
  }
}


client
  .connect()
  .then(() => {
    console.log("DATABASE CONNECTED!");
  })
  .catch((e) => {
    console.log(e);
  });

async function find(params = {}) {
  try {
    const data = await users.find(params).toArray();
    return data;
  } catch (err) {
    return [];
  }
}

async function findOne(params = {}) {
  try {
    const data = await users.findOne(params);
    return data;
  } catch (err) {
    return null;
  }
}

async function insertOne(params = {}) {
  try {
    await users.insertOne(params)
    return true;
  } catch (err) {
    return false;
  }
}

async function deleteOne(params = {}) {
  try {
    await users.deleteOne(params)
    return true;
  } catch (err) {
    return false;
  }
}

async function deleteMany(params = {}) {
  try {
    await users.deleteMany(params)
    return true;
  } catch (err) {
    return false;
  }
}


async function updateOne(params = {}, set = {}) {
  try {
    await users.updateOne(params, set);
    console.log(`Найдено ${result.matchedCount} документов, обновлено ${result.modifiedCount}`);
    return true;
  } catch (err) {
    return false;
  }
}





async function finde(params = {}) {
  try {
    const db = await client.db("test");
    const users = await db.collection("users");

    const data = await users.find(params).toArray();

    return data;
  } catch (err) {
    return [];
  }
}



module.exports = { find, findOne, insertOne,  deleteOne, deleteMany, clearCollection, updateOne};
