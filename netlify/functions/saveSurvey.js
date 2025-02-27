// netlify/functions/saveSurvey.js
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'moralcube';
const COLLECTION_NAME = 'surveys';

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse the request body
  let surveyData;
  try {
    surveyData = JSON.parse(event.body);
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Get user ID from Auth0 token
  const token = event.headers.authorization?.split(' ')[1];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let userId;
  try {
    // Decode token to get user info (usually sub is the user ID)
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

  // Add user ID to survey data
  surveyData.userId = userId;
  
  // Add timestamps
  surveyData.created = new Date().toISOString();
  surveyData.lastModified = new Date().toISOString();

  // Connect to MongoDB
  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    // Check if this is an update or new entry
    if (surveyData.id) {
      // If the survey has an ID, check if it belongs to this user
      const existingSurvey = await collection.findOne({ 
        id: surveyData.id,
        userId: userId
      });
      
      if (existingSurvey) {
        // Update existing survey
        const result = await collection.updateOne(
          { id: surveyData.id, userId: userId },
          { $set: surveyData }
        );
        
        return {
          statusCode: 200,
          body: JSON.stringify({ 
            success: true, 
            message: 'Survey updated successfully',
            id: surveyData.id
          })
        };
      }
    }
    
    // Generate a new ID if needed
    if (!surveyData.id) {
      surveyData.id = `survey_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    
    // Insert new survey
    const result = await collection.insertOne(surveyData);
    
    return {
      statusCode: 201,
      body: JSON.stringify({ 
        success: true, 
        message: 'Survey saved successfully',
        id: surveyData.id
      })
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