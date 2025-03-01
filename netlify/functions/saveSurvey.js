// netlify/functions/saveSurvey.js
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'MoralCube';
const COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME || 'surveys';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Connection pooling - cache database connection between invocations
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  // If connection exists, reuse it
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Create new connection
  try {
    // Set MongoDB connection options for better reliability
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    };

    const client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    
    const db = client.db(DB_NAME);
    
    // Cache the database connection
    cachedClient = client;
    cachedDb = db;
    
    return { client, db };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

exports.handler = async (event, context) => {
  // Set context.callbackWaitsForEmptyEventLoop to false to keep the connection alive
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Start request logging
  const requestId = context.awsRequestId || `req-${Date.now()}`;
  console.log(`[${requestId}] Processing ${event.httpMethod} request`);
  
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    console.log(`[${requestId}] Method not allowed: ${event.httpMethod}`);
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }

  // Parse the request body
  let surveyData;
  try {
    surveyData = JSON.parse(event.body);
    
    // Basic validation of survey data
    if (!surveyData.survey) {
      throw new Error('Missing required survey data');
    }
  } catch (error) {
    console.error(`[${requestId}] Invalid request body:`, error);
    return { 
      statusCode: 400, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Invalid request data', 
        message: error.message 
      }) 
    };
  }

  // Authentication - Get user ID from Auth0 token
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.split(' ')[1];
  
  if (!token) {
    console.error(`[${requestId}] Missing authentication token`);
    return { 
      statusCode: 401, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Authentication required' }) 
    };
  }

  let userId;
  try {
    // Decode token to get user info (usually sub is the user ID)
    const decoded = jwt.decode(token);
    userId = decoded?.sub;
    
    // Validate token structure
    if (!userId || !decoded.exp) {
      throw new Error('Invalid token structure');
    }
    
    // Check token expiration
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    if (Date.now() > expirationTime) {
      throw new Error('Token has expired');
    }
    
    console.log(`[${requestId}] Authenticated user: ${userId}`);
  } catch (error) {
    console.error(`[${requestId}] Authentication error:`, error);
    return { 
      statusCode: 401, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Authentication failed', 
        message: error.message 
      }) 
    };
  }

  // Extract survey data and ensure it has the required structure
  const survey = surveyData.survey;
  
  // Add metadata
  survey.userId = userId;
  
  // Handle timestamps
  if (!survey.created) {
    survey.created = new Date().toISOString();
  }
  survey.lastModified = new Date().toISOString();

  // Database operations
  let connection;
  try {
    // Get database connection
    connection = await connectToDatabase();
    const collection = connection.db.collection(COLLECTION_NAME);
    
    console.log(`[${requestId}] Connected to database ${DB_NAME}.${COLLECTION_NAME}`);
    
    // Check if this is an update or new entry
    if (survey.id) {
      console.log(`[${requestId}] Checking if survey exists: ${survey.id}`);
      
      // If the survey has an ID, check if it belongs to this user
      const existingSurvey = await collection.findOne({ 
        id: survey.id,
        userId: userId
      });
      
      if (existingSurvey) {
        console.log(`[${requestId}] Updating existing survey: ${survey.id}`);
        
        // Update existing survey
        const result = await collection.updateOne(
          { id: survey.id, userId: userId },
          { $set: survey }
        );
        
        console.log(`[${requestId}] Survey updated successfully: ${survey.id}`);
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: true, 
            message: 'Survey updated successfully',
            id: survey.id,
            modifiedCount: result.modifiedCount
          })
        };
      } else {
        console.log(`[${requestId}] Survey ID exists but not owned by user, creating new entry`);
      }
    }
    
    // Generate a new ID if needed
    if (!survey.id) {
      survey.id = `survey_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      console.log(`[${requestId}] Generated new survey ID: ${survey.id}`);
    }
    
    // Insert new survey
    console.log(`[${requestId}] Inserting new survey: ${survey.id}`);
    const result = await collection.insertOne(survey);
    
    console.log(`[${requestId}] Survey saved successfully: ${survey.id}`);
    
    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: true, 
        message: 'Survey saved successfully',
        id: survey.id
      })
    };
    
  } catch (error) {
    console.error(`[${requestId}] Database operation error:`, error);
    
    // Provide different error details based on environment
    const errorDetails = NODE_ENV === 'development' ? 
      { stack: error.stack, details: error.message } : 
      { details: 'An internal database error occurred' };
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Database error', 
        ...errorDetails
      })
    };
  }
};