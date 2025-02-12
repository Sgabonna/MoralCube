// netlify/functions/fetchScenarios.js
const { MongoClient } = require("mongodb");

let cachedClient = null;

// Helper function to connect to MongoDB
async function connectToDatabase(uri) {
  // Check if we already have a connected client
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    return cachedClient;
  }
  // Create a new MongoClient and connect
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
    // Get the MongoDB connection string from your environment variable.
    // Make sure that on Netlify you have set MONGODB_URI to:
    // mongodb+srv://Scott:UIImufFMNtKJ9j6o@moralcube.a1vhe.mongodb.net/
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    // Connect to MongoDB using the connection string from the environment variable
    const client = await connectToDatabase(uri);

    // Specify your database name. For example, if you want to use the "moralcube" database:
    const database = client.db("moralcube");
    // Specify your collection name; here we assume "scenarios"
    const collection = database.collection("scenarios");

    // Query the collection to retrieve all scenarios
    const scenarios = await collection.find({}).toArray();

    // Return the data as a JSON response
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
