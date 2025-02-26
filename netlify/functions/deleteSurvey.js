// netlify/functions/deleteSurvey.js
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'moralcube';
const COLLECTION_NAME = 'user_surveys';

exports.handler = async (event, context) => {
  // Only allow DELETE requests
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Get survey ID from query params
  const surveyId = event.queryStringParameters?.id;
  if (!surveyId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Survey ID is required' }) };
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
    
    // First check if the survey exists and belongs to the user
    const survey = await collection.findOne({ id: surveyId });
    
    if (!survey) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Survey not found' })
      };
    }
    
    // Check if this is a model survey (AI-generated)
    if (survey.metadata?.llmSource?.model && 
        survey.metadata.llmSource.model !== "Human") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Cannot delete AI model surveys' })
      };
    }
    
    // Check if this belongs to the current user
    if (survey.userId !== userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'You can only delete your own surveys' })
      };
    }
    
    // Now we're safe to delete the survey
    const result = await collection.deleteOne({ id: surveyId });
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        message: 'Survey deleted successfully' 
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