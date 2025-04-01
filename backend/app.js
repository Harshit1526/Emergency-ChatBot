const express = require("express");
const bodyParser = require("body-parser");
const chatbotRoutes = require("./routes/chatbot");
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configure CORS
app.use(cors());

// Increase payload size limit for file uploads
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use("/api/chat", chatbotRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
