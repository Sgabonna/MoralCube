const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Enable CORS so your frontend can access this API
app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas
const mongoURI = 'mongodb+srv://MoralCube:Smartass1@moralcube.a1vhe.mongodb.net/';
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => console.error('MongoDB connection error:', err));

// Define a schema matching your JSON data structure
const scenarioSchema = new mongoose.Schema({
  id: String,
  type: String,
  metadata: {
    title: String,
    description: String,
    category: String,
    llmSource: {
      model: String,
      version: String,
      provider: String
    },
    classification: {
      type: String,
      justification: String
    },
    url: String
  },
  survey: mongoose.Schema.Types.Mixed  // Use Mixed for flexible structure
  // Add any other fields as necessary
}, { collection: 'scenarios' });

const Scenario = mongoose.model('Scenario', scenarioSchema);

// Create an API endpoint to fetch all scenarios
app.get('/api/scenarios', async (req, res) => {
  try {
    const scenarios = await Scenario.find();
    res.json(scenarios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
