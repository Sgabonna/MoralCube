// netlify/functions/submitFeedback.js
const { MongoClient } = require("mongodb");
const fetch = require("node-fetch");  // Add this if missing

let cachedClient = null;

async function connectToDatabase(uri) {
    if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
        return cachedClient;
    }

    console.log("Attempting to connect to database...");
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    try {
        await client.connect();
        console.log("Successfully connected to database");
        cachedClient = client;
        return client;
    } catch (error) {
        console.error("Database connection error:", error);
        throw error;
    }
}

exports.handler = async (event, context) => {
    console.log("Function started");

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const data = JSON.parse(event.body);
        console.log("Received data:", data);

        // Validate required fields
        if (!data.name || !data.email || !data.comment || !data.feedbackType) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required fields' })
            };
        }

        // Connect to MongoDB
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            console.error("Missing MONGODB_URI");
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Database configuration missing' })
            };
        }

        const client = await connectToDatabase(uri);
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

        console.log("Attempting to insert feedback:", feedback);
        await collection.insertOne(feedback);
        console.log("Feedback inserted successfully");

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ message: 'Feedback submitted successfully' })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: error.message 
            })
        };
    }
};