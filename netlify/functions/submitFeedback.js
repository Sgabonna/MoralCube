const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");

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

async function verifyRecaptcha(token) {
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`,
  });

  const data = await response.json();
  return data.success;
}

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    
    // Verify reCAPTCHA
    const isRecaptchaValid = await verifyRecaptcha(data.recaptchaResponse);
    if (!isRecaptchaValid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid reCAPTCHA' })
      };
    }

    // Validate required fields
    if (!data.name || !data.email || !data.comment || !data.feedbackType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Connect to MongoDB
    const client = await connectToDatabase(process.env.MONGODB_URI);
    const database = client.db("MoralCube");
    const collection = database.collection("Feedback");

    // Create feedback document
    const feedback = {
      name: data.name,
      email: data.email,
      comment: data.comment,
      feedbackType: data.feedbackType,
      subscribe: data.subscribe,
      createdAt: new Date(),
      status: 'new'
    };

    // Insert feedback into database
    await collection.insertOne(feedback);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Feedback submitted successfully' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};