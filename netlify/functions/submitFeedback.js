const { MongoClient } = require('mongodb');

exports.handler = async function(event, context) {
    // Ensure method is POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('moral-cube');
        const feedback = database.collection('feedback');
        
        const data = JSON.parse(event.body);
        
        // Insert feedback into MongoDB
        await feedback.insertOne(data);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Feedback submitted successfully' })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to submit feedback' })
        };
    } finally {
        await client.close();
    }
};