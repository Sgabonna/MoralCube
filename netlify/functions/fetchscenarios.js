// netlify/functions/fetchScenarios.js
const { MongoClient } = require("mongodb");

let cachedClient = null;

async function connectToDatabase(uri) {
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    return cachedClient;
  }
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  cachedClient = client;
  return client;
}

exports.handler = async (event, context) => {
  try {
    // Retrieve the MongoDB connection string from your environment variable.
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("Missing MONGODB_URI environment variable");
    }
    
    const client = await connectToDatabase(uri);
    const database = client.db("moralcube");      // Verify that this is your correct database name
    const collection = database.collection("scenarios"); // And that "scenarios" is the correct collection

    const scenarios = await collection.find({}).toArray();

    return {
      statusCode: 200,
      body: JSON.stringify({ scenarios }),
    };
  } catch (error) {
    console.error("Error fetching scenarios:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
