const express = require("express");
const axios = require("axios");
const pool = require("../database.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require("multer");
const sharp = require("sharp");
const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Initialize Gemini for text and audio
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Initialize Clarifai with specific models
const PAT = process.env.CLARIFAI_API_KEY;
const USER_ID = 'clarifai';
const APP_ID = 'main';

// Using the correct model ID for medical analysis
const MEDICAL_MODEL = {
  ID: 'general-image-recognition',
  VERSION: 'aa7f35c01e0642fda5cf400f543e7c40'
};

// Existing chat endpoint
router.post("/", async (req, res) => {
  const { message } = req.body;

  try {
    const prompt = `Respond to the following emergency message with a concise and informative response within 128 words: "${message}"`;
    const result = await model.generateContent(prompt);
    let botReply = result.response.text();

    // Handle emergencies 
    const emergencyType = identifyEmergency(message);
    if (emergencyType) {
      const twitterHandle = getTwitterHandleForEmergency(emergencyType);
      botReply += ` Contact ${twitterHandle} for assistance.`; 
      botReply = botReply.slice(0, 128); 
    }

    res.json({ 
      reply: botReply,
      options: [
        { text: "Tweet this response", value: "tweet" },
        { text: "Ask another query", value: "query" }
      ]
    }); 
  } catch (err) {
    console.error("Chat endpoint error:", err);
    res.status(500).json({ 
      error: "Something went wrong. Please try again.",
      details: err.message 
    });
  }
});

// Image analysis endpoint
router.post("/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    // Process image with sharp
    const processedImage = await sharp(req.file.buffer)
      .resize(800, 800, { fit: 'inside' })
      .toBuffer();

    const base64Image = processedImage.toString('base64');

    // Analyze with medical model
    const analysis = await analyzeWithModel(base64Image);

    // Get enhanced analysis from Gemini
    const geminiAnalysis = await getEnhancedGeminiAnalysis(analysis);

    // Return only essential information
    res.json({
      recommendations: analysis.recommendations,
      geminiAnalysis
    });

  } catch (error) {
    console.error("Image analysis error:", error);
    res.status(500).json({ 
      error: "Error analyzing image. Please try again.",
      details: error.message 
    });
  }
});

async function analyzeWithModel(base64Image) {
  const raw = JSON.stringify({
    "user_app_id": {
      "user_id": USER_ID,
      "app_id": APP_ID
    },
    "inputs": [
      {
        "data": {
          "image": {
            "base64": base64Image
          }
        }
      }
    ]
  });

  try {
    const response = await axios({
      method: 'post',
      url: `https://api.clarifai.com/v2/models/${MEDICAL_MODEL.ID}/versions/${MEDICAL_MODEL.VERSION}/outputs`,
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Key ' + PAT
      },
      data: raw
    });

    if (!response.data || !response.data.outputs || !response.data.outputs[0]) {
      throw new Error('Invalid response from Clarifai API');
    }

    const concepts = response.data.outputs[0].data.concepts || [];
    return analyzeMedicalConcepts(concepts);
  } catch (error) {
    console.error("Clarifai API error:", error.response?.data || error.message);
    throw new Error('Failed to analyze image with medical model');
  }
}

function analyzeMedicalConcepts(concepts) {
  // Filter and sort relevant concepts
  const relevantConcepts = concepts
    .filter(c => c.value > 0.5)
    .sort((a, b) => b.value - a.value);

  // Determine injury characteristics
  const injuryKeywords = ['cut', 'wound', 'laceration', 'bleeding', 'blood', 'injury', 'trauma'];
  const injuryDetails = relevantConcepts.filter(c => 
    injuryKeywords.some(keyword => c.name.toLowerCase().includes(keyword))
  );

  const hasBlood = relevantConcepts.some(c => 
    c.name.toLowerCase().includes('blood') && c.value > 0.5
  );

  // Calculate severity
  let severity = "LOW";
  if (hasBlood || injuryDetails.length > 0) {
    severity = "HIGH";
  }

  return {
    severity,
    recommendations: generateMinimalRecommendations(severity, hasBlood)
  };
}

function generateMinimalRecommendations(severity, hasBlood) {
  if (severity === "HIGH" || hasBlood) {
    return `🚨 EMERGENCY - CALL 911 NOW

1. Apply direct pressure with clean cloth
2. Keep pressure until help arrives
3. Do not remove blood-soaked cloths

⚠️ WARNING SIGNS:
• Heavy bleeding
• Deep wound
• Loss of consciousness`;
  } else {
    return `⚠️ MINOR INJURY

1. Clean wound with antiseptic
2. Apply pressure to stop bleeding
3. Cover with bandage

⚠️ WATCH FOR:
• Redness
• Swelling
• Pain`;
  }
}

async function getEnhancedGeminiAnalysis(analysis) {
  const prompt = `Emergency medical situation detected. Provide ONLY these 3 things:

1. CALL 911 NOW (if severe)
2. 3 immediate steps to take
3. 3 warning signs to watch for

Keep it extremely brief and clear. No explanations or additional details.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return "Follow the first aid recommendations above.";
  }
}

// Audio analysis endpoint
router.post("/analyze-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    // Convert audio to text using speech-to-text
    const audioBuffer = req.file.buffer;
    const text = await convertAudioToText(audioBuffer);

    // Analyze the transcribed text
    const prompt = `Analyze this emergency situation audio transcript and provide a detailed description of what you hear. Focus on:
    1. The type of emergency
    2. Severity level
    3. Immediate actions needed
    4. Required emergency services
    Please be concise but informative.

    Transcript: "${text}"`;

    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    res.json({
      analysis,
      emergencyType: identifyEmergency(analysis),
      severity: determineSeverity(analysis)
    });
  } catch (error) {
    console.error("Audio analysis error:", error);
    res.status(500).json({ 
      error: "Error analyzing audio",
      details: error.message 
    });
  }
});

// Helper functions
function identifyEmergency(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("fire")) return "fire";
  if (lowerText.includes("accident") || lowerText.includes("crash")) return "accident";
  if (lowerText.includes("medical") || lowerText.includes("injury")) return "medical";
  if (lowerText.includes("flood") || lowerText.includes("water")) return "flood";
  if (lowerText.includes("earthquake")) return "earthquake";
  return null;
}

function determineSeverity(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("critical") || lowerText.includes("severe") || lowerText.includes("life-threatening")) return "high";
  if (lowerText.includes("urgent") || lowerText.includes("immediate")) return "medium";
  return "low";
}

function getTwitterHandleForEmergency(emergencyType) {
  const handles = {
    fire: "@firedept",
    police: "@policedept",
    ambulance: "@ambulance",
    flood: "@floodcontrol",
    earthquake: "@earthquake_alert"
  };
  return handles[emergencyType] || "@emergencyservices";
}

// Mock function for audio to text conversion
async function convertAudioToText(audioBuffer) {
  // In a real implementation, you would use a speech-to-text service
  return "This is a mock audio transcription. In a real implementation, this would be converted from the audio file.";
}

module.exports = router;
