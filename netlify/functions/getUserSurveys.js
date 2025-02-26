// netlify/functions/getUserSurveys.js
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'moralcube';
const COLLECTION_NAME = 'user_surveys';

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Get user ID from Auth0 token
  const token = event.headers.authorization?.split(' ')[1];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let userId;
  try {
    // Decode token to get user info
    const decoded = jwt.decode(token);
    userId = decoded.sub;
    if (!userId) {
      throw new Error('User ID not found in token');
    }
  } catch (error) {
    return { 
      statusCode: 401, 
      body: JSON.stringify({ error: 'Invalid authentication token' }) 
    };
  }

  // Connect to MongoDB
  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    // Get user's surveys
    const surveys = await collection.find({ userId: userId })
                                     .sort({ lastModified: -1 })
                                     .toArray();
    
    return {
      statusCode: 200,
      body: JSON.stringify({ surveys })
    };
    
  } catch (error) {
    console.error('MongoDB error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database error', details: error.message })
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
};