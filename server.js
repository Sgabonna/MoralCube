const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path'); // Import the path module

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Use the environment variable if available, otherwise fallback to your connection string
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://MoralCube:Smartass1@moralcube.a1vhe.mongodb.net/myDatabase?retryWrites=true&w=majority';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => console.error('MongoDB connection error:', err));

// Define your Mongoose schema and API route (unchanged)
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
  survey: mongoose.Schema.Types.Mixed
}, { collection: 'scenarios' });

const Scenario = mongoose.model('Scenario', scenarioSchema);

app.get('/api/scenarios', async (req, res) => {
  try {
    const scenarios = await Scenario.find();
    res.json(scenarios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback route: send index.html for any GET request that doesn't match above routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
