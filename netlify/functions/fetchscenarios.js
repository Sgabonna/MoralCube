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
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error("Missing MONGODB_URI");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing database configuration" })
      };
    }
    
    console.log("Attempting database connection...");
    const client = await connectToDatabase(uri);
    console.log("Connected to database");
    
    const database = client.db("MoralCube");
    const collection = database.collection("Scenarios");
    
    console.log("Fetching scenarios...");
    const scenarios = await collection.find({}).toArray();
    console.log(`Found ${scenarios.length} scenarios`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        scenarios,
        timestamp: new Date().toISOString(),
        count: scenarios.length
      })
    };
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
    };
  }
};
