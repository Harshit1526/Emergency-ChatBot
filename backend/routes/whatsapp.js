const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process"); // For FFmpeg execution
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);
const TWILIO_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

app.post("/twilio-webhook", async (req, res) => {
    const senderNumber = req.body.From;
    const incomingMsg = req.body.Body || "";
    const numMedia = parseInt(req.body.NumMedia) || 0;

    console.log(`Received WhatsApp message from ${senderNumber}: ${incomingMsg}`);

    try {
        let botReply = "Sorry, no response available.";

        if (numMedia > 0) {
            const mediaUrl = req.body.MediaUrl0;
            const mediaType = req.body.MediaContentType0;

            console.log(`Received media: ${mediaUrl} (Type: ${mediaType})`);

            // Define file extension and save path
            const fileExtension = mediaType.split("/")[1];
            const fileName = `upload_${Date.now()}.${fileExtension}`;
            const filePath = path.join(UPLOADS_DIR, fileName);

            // Download media with authentication
            const mediaResponse = await axios.get(mediaUrl, {
                auth: { username: accountSid, password: authToken },
                responseType: "arraybuffer",
            });

            fs.writeFileSync(filePath, mediaResponse.data);

            let aiResponse;
            if (mediaType.startsWith("image/")) {
                console.log(`Processing image: ${fileName}`);

                // Prepare form data for image
                const formData = new FormData();
                formData.append("image", fs.createReadStream(filePath));

                aiResponse = await axios.post("http://localhost:5000/api/chat/analyze-image", formData, {
                    headers: formData.getHeaders(),
                });

            } else if (mediaType.startsWith("audio/")) {
                console.log(`Processing audio: ${fileName}`);

                const convertedFileName = `converted_${Date.now()}.wav`;
                const convertedPath = path.join(UPLOADS_DIR, convertedFileName);

                await convertAudio(filePath, convertedPath); // Convert OGG to WAV

                const formData = new FormData();
                formData.append("audio", fs.createReadStream(convertedPath), { filename: convertedFileName });

                aiResponse = await axios.post("http://localhost:5000/api/chat/analyze-audio", formData, {
                    headers: formData.getHeaders(),
                });

                // Cleanup converted audio file
                fs.unlinkSync(convertedPath);
            }

            botReply = aiResponse?.data?.recommendations || aiResponse?.data?.analysis || "Analysis failed.";
        } else {
            // Handle Text Message
            const response = await axios.post("http://localhost:5000/api/chat", { message: incomingMsg });
            botReply = response.data.reply || "Sorry, no response available.";
        }

        // Send WhatsApp reply
        await sendWhatsappMessage(senderNumber, botReply);
        res.status(200).send("WhatsApp message processed successfully");

    } catch (error) {
        console.error("Error processing WhatsApp message:", error.message);
        res.status(500).send("Failed to process WhatsApp message");
    }
});

// Function to Convert Audio (OGG → WAV)
async function convertAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`, (error, stdout, stderr) => {
            if (error) {
                console.error("Audio conversion error:", stderr);
                return reject(error);
            }app.post("/twilio-webhook", async (req, res) => {
                const senderNumber = req.body.From;
                const incomingMsg = req.body.Body || "";
                const numMedia = parseInt(req.body.NumMedia) || 0;
            
                console.log(`Received WhatsApp message from ${senderNumber}: ${incomingMsg}`);
            
                try {
                    let botReply = "Sorry, no response available.";
                    let filePath = null;
            
                    if (numMedia > 0) {
                        const mediaUrl = req.body.MediaUrl0;
                        const mediaType = req.body.MediaContentType0;
            
                        console.log(`Received media: ${mediaUrl} (Type: ${mediaType})`);
            
                        // Define file extension and save path
                        const fileExtension = mediaType.split("/")[1];
                        const fileName = `upload_${Date.now()}.${fileExtension}`;
                        filePath = path.join(UPLOADS_DIR, fileName);
            
                        // Download media with authentication
                        const mediaResponse = await axios.get(mediaUrl, {
                            auth: { username: accountSid, password: authToken },
                            responseType: "arraybuffer",
                        });
            
                        fs.writeFileSync(filePath, mediaResponse.data);
            
                        let aiResponse;
                        if (mediaType.startsWith("image/")) {
                            console.log(`Processing image: ${fileName}`);
            
                            // Prepare form data for image
                            const formData = new FormData();
                            formData.append("image", fs.createReadStream(filePath));
            
                            aiResponse = await axios.post("http://localhost:5000/api/chat/analyze-image", formData, {
                                headers: formData.getHeaders(),
                            });
            
                        } else if (mediaType.startsWith("audio/")) {
                            console.log(`Processing audio: ${fileName}`);
            
                            const convertedFileName = `converted_${Date.now()}.wav`;
                            const convertedPath = path.join(UPLOADS_DIR, convertedFileName);
            
                            await convertAudio(filePath, convertedPath); // Convert OGG to WAV
            
                            const formData = new FormData();
                            formData.append("audio", fs.createReadStream(convertedPath), { filename: convertedFileName });
            
                            aiResponse = await axios.post("http://localhost:5000/api/chat/analyze-audio", formData, {
                                headers: formData.getHeaders(),
                            });
            
                            // Cleanup converted audio file
                            fs.unlinkSync(convertedPath);
                        }
            
                        botReply = aiResponse?.data?.recommendations || aiResponse?.data?.analysis || "Analysis failed.";
                    } else {
                        // Handle Text Message
                        const response = await axios.post("http://localhost:5000/api/chat", { message: incomingMsg });
                        botReply = response.data.reply || "Sorry, no response available.";
                    }
            
                    // Send WhatsApp reply
                    await sendWhatsappMessage(senderNumber, botReply);
            
                    // Delete the uploaded file (cleanup)
                    if (filePath) {
                        fs.unlink(filePath, (err) => {
                            if (err) console.error(`Error deleting file: ${filePath}`, err);
                            else console.log(`File deleted: ${filePath}`);
                        });
                    }
            
                    res.status(200).send("WhatsApp message processed successfully");
            
                } catch (error) {
                    console.error("Error processing WhatsApp message:", error.message);
                    res.status(500).send("Failed to process WhatsApp message");
                }
            });
            
            console.log(`Audio converted successfully: ${outputPath}`);
            resolve(outputPath);
        });
    });
}

// Function to Send WhatsApp Messages
async function sendWhatsappMessage(to, message) {
    try {
        const maxLength = 1600;
        const trimmedMessage = message.length > maxLength ? message.slice(0, maxLength) + "..." : message;

        await twilioClient.messages.create({
            body: trimmedMessage,
            from: `whatsapp:${TWILIO_NUMBER}`,
            to: to,  
        });

        console.log(`WhatsApp message sent to ${to}: ${trimmedMessage}`);
    } catch (error) {
        console.error("Error sending WhatsApp message:", error.message);
    }
}

app.listen(PORT, () => {
    console.log(`Twilio WhatsApp Webhook server running on port ${PORT}`);
});
