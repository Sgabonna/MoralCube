// netlify/functions/submitScenario.js
const { MongoClient } = require('mongodb');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Initialize AI clients
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Rate limiting and spam protection
const submissionCounts = new Map();
const dailySubmissions = new Map();
const RATE_LIMIT = 3; // submissions per hour per IP
const DAILY_LIMIT = 50; // total submissions per day (all users)
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  const today = new Date().toDateString();
  
  // Check daily global limit
  const dailyCount = dailySubmissions.get(today) || 0;
  if (dailyCount >= DAILY_LIMIT) {
    return { allowed: false, reason: 'Daily submission limit reached. Please try again tomorrow.' };
  }
  
  // Check per-IP rate limit
  const userSubmissions = submissionCounts.get(ip) || [];
  const recentSubmissions = userSubmissions.filter(time => now - time < RATE_WINDOW);
  
  if (recentSubmissions.length >= RATE_LIMIT) {
    return { allowed: false, reason: 'Too many submissions. Please wait before submitting again.' };
  }
  
  // Update counters
  recentSubmissions.push(now);
  submissionCounts.set(ip, recentSubmissions);
  dailySubmissions.set(today, dailyCount + 1);
  
  return { allowed: true };
}

function moderateContent(text) {
  const spamPatterns = [
    /buy.{0,10}now/i,
    /click.{0,10}here/i,
    /free.{0,10}money/i,
    /make.{0,10}\$\d+/i,
    /advertisement/i,
    /spam/i,
    /http[s]?:\/\/(?!.*\.(edu|gov|org))/i, // Block non-educational URLs
  ];
  
  for (const pattern of spamPatterns) {
    if (pattern.test(text)) {
      return false;
    }
  }
  
  return true;
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    // Parse request body
    const { title, description, url, aiModel } = JSON.parse(event.body);
    
    // Get client IP for rate limiting
    const clientIp = event.headers['x-forwarded-for'] || 
                    event.headers['client-ip'] || 
                    'unknown';
    
    // Check rate limits
    const rateLimitCheck = checkRateLimit(clientIp);
    if (!rateLimitCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: rateLimitCheck.reason })
      };
    }
    
    // Enhanced validation
    if (!title || !description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Title and description are required' })
      };
    }
    
    if (title.length < 5 || title.length > 100) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Title must be between 5-100 characters' })
      };
    }
    
    if (description.length < 50 || description.length > 500) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Description must be between 50-500 characters' })
      };
    }
    
    // Content moderation
    if (!moderateContent(title) || !moderateContent(description)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Content rejected by moderation filter' })
      };
    }
    
    // Prepare AI analysis prompt
    const selectedModel = aiModel || 'claude';
    const prompt = `I'd like you to use the below survey, and json formatting to evaluate the moral scenario provided to you. Question 1 to 14 needs to be answered with a score within the given scales, and a justification for each score. Please only provide scores within the scales provided.

Title: ${title}
Scenario Description: ${description}
URL: ${url || ''}

________________________________________
Ends (Focus) Questions – X Axis
________________________________________
Question 1: Focus on Societal Needs (Scale: 0.0-4.0)
Question 2: Focus on Others' Needs (Scale: 0.0-4.0)
Question 3: Focus on Others' Wants (Scale: 0.0-4.0)
Question 4: Focus on Personal Needs (Scale: 0.0 to -4.0)
Question 5: Focus on Personal Wants (Scale: 0.0 to -4.0)

________________________________________
Means (Sacrifice) Questions – Y-axis
________________________________________
Question 6: Degree of Future Self-Sacrifice (Scale: 0.0 to -4.0)
Question 7: Number of Individuals Affected (Scale: 0.0 to -6.0)
Question 8: Type of Sacrifice (Scale: 0.0 to -4.0)
Question 9: Duration of Sacrifice (Scale: 0.0 to -4.0)
Question 10: Magnitude of Life Impacted (Scale: 0.01 to 1.2)

________________________________________
Character Questions – Z-Axis
________________________________________
Question 11: Unconscious vs. Conscious (Scale: 0.0-1.0)
Question 12: Degree of Present Self-Sacrifice (Scale: 0.0-2.0)
Question 13: Habitual vs. Willpower (Scale: 0.0-4.0)
Question 14: Unintentional vs. Intentional (Scale: 0.0-1.0)

Please analyze and provide response in this JSON format:
{
  "id": "${title.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedModel}",
  "type": "base",
  "metadata": {
    "title": "${title}",
    "description": "${description}",
    "category": "Choose from: Evil, Virtue, Vice, Sin, Morally Grey, World Building",
    "llmSource": {
      "model": "${selectedModel === 'claude' ? 'Claude' : 'GPT-4'}",
      "version": "${selectedModel === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4-0125-preview'}",
      "provider": "${selectedModel === 'claude' ? 'Anthropic' : 'OpenAI'}"
    },
    "url": "${url || ''}"
  },
  "survey": {
    "dimensions": [
      {
        "id": "Ends",
        "axis": "x",
        "label": "Motivation",
        "questions": [
          {"question": "Societal Needs", "score": 0, "justification": ""},
          {"question": "Others Needs", "score": 0, "justification": ""},
          {"question": "Others Wants", "score": 0, "justification": ""},
          {"question": "Personal Needs", "score": 0, "justification": ""},
          {"question": "Personal Wants", "score": 0, "justification": ""}
        ]
      },
      {
        "id": "Means",
        "axis": "y", 
        "label": "Sacrifice",
        "questions": [
          {"question": "Degree of Future Self-Sacrifice", "score": 0, "justification": ""},
          {"question": "Number of Individuals Affected", "score": 0, "justification": ""},
          {"question": "Type of Sacrifice", "score": 0, "justification": ""},
          {"question": "Duration of Sacrifice", "score": 0, "justification": ""},
          {"question": "Magnitude of Life Impacted", "score": 1.0, "justification": ""}
        ]
      },
      {
        "id": "Character",
        "axis": "z",
        "label": "Self-Control",
        "questions": [
          {"question": "Unconscious vs Conscious", "score": 0, "justification": ""},
          {"question": "Degree of Present Self-Sacrifice", "score": 0, "justification": ""},
          {"question": "Habit vs Will Power", "score": 0, "justification": ""},
          {"question": "Unintentional vs Intentional", "score": 0, "justification": ""}
        ]
      }
    ],
    "finalPosition": {
      "x": 0,
      "y": 0,
      "z": 0
    }
  }
}`;

    // Call AI API
    let completion;
    let modelInfo = {};
    
    try {
      if (selectedModel === 'gpt') {
        completion = await openai.chat.completions.create({
          model: 'gpt-4-0125-preview',
          messages: [
            {
              role: 'system',
              content: 'You are an expert in ethical analysis. Please respond with only the JSON format requested, without any additional text or markdown formatting.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 3000,
          response_format: { type: "json_object" }
        });
        
        modelInfo = {
          model: "GPT-4",
          version: "gpt-4-0125-preview",
          provider: "OpenAI"
        };
        
      } else {
        completion = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 3000,
          temperature: 0.3,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        modelInfo = {
          model: "Claude",
          version: "claude-3-5-sonnet-20241022", 
          provider: "Anthropic"
        };
      }
    } catch (apiError) {
      console.error('AI API error:', apiError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'AI analysis failed. Please try again.',
          details: process.env.NODE_ENV === 'development' ? apiError.message : undefined
        })
      };
    }
    
    // Parse AI response
    let analysisData;
    try {
      let responseText;
      
      if (selectedModel === 'gpt') {
        responseText = completion.choices[0].message.content;
      } else {
        responseText = completion.content[0].text;
      }
      
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        analysisData = JSON.parse(responseText);
      } else {
        analysisData = JSON.parse(jsonMatch[0]);
      }
      
      // Calculate final position
      const endsScore = analysisData.survey.dimensions[0].questions.reduce((sum, q) => sum + (q.score || 0), 0);
      const meansScore = analysisData.survey.dimensions[1].questions.slice(0,4).reduce((sum, q) => sum + (q.score || 0), 0) * 
                       (analysisData.survey.dimensions[1].questions[4].score || 1.0);
      const characterScore = analysisData.survey.dimensions[2].questions.reduce((sum, q) => sum + (q.score || 0), 0);
      
      analysisData.survey.finalPosition = {
        x: endsScore,
        y: meansScore,
        z: characterScore
      };
      
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to parse AI analysis' })
      };
    }
    
    // Add submission metadata
    analysisData.submittedAt = new Date();
    analysisData.submittedBy = clientIp;
    
    // Connect to MongoDB and save to main Scenarios collection
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database configuration missing' })
      };
    }
    
    const client = await connectToDatabase(uri);
    const database = client.db("MoralCube");
    const collection = database.collection("Scenarios");
    
    // Insert the analyzed scenario
    const result = await collection.insertOne(analysisData);
    
    if (!result.insertedId) {
      throw new Error('Failed to insert document');
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Scenario analyzed and added successfully!',
        id: analysisData.id,
        position: analysisData.survey.finalPosition
      })
    };
    
  } catch (error) {
    console.error('Submission error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process submission',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};