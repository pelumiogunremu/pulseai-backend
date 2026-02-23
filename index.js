// index.js (Node.js + Express + Twilio + Gemini)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI, Type } = require("@google/genai");
const { Twilio } = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
// Initialize Twilio
const twilioClient = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// Agency List for Routing
const AGENCIES = [
  "Kwara State Fire Service",
  "Kwara State Police Command",
  "Nigeria Security and Civil Defence Corps (NSCDC Kwara)",
  "Kwara State Emergency Management Agency (KW-SEMA)",
  "Ministry of Works and Transport",
  "Kwara Road Maintenance Agency (KWARMA)",
  "Kwara State Water Corporation",
  "RUWASSA (Rural Water Supply and Sanitation Agency)",
  "Kwara State Waste Management Agency (KWASMA)",
  "Kwara Environmental Protection Agency (KWEPA)",
  "Physical Planning Authority / Urban Development",
  "Rural Electrification Board (REB)",
  "Ministry of Energy",
  "Ministry of Health",
  "Primary Health Care Development Agency (PHCDA)",
  "Kwara Health Insurance Agency (KHIA)",
  "Ministry of Education & Human Capital Development",
  "State Universal Basic Education Board (SUBEB)",
  "Teaching Service Commission (TESCOM)",
  "Kwara Internal Revenue Service (KW-IRS)",
  "Bureau of Lands (KW-GIS)",
  "KWASSIP (Social Investment Programmes)",
  "Ministry of Women Affairs and Social Development"
];

// Gemini Schema Configuration
const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    user_message: { type: Type.STRING },
    internal_actions: {
      type: Type.OBJECT,
      properties: {
        intent: { type: Type.STRING, enum: ["new_report", "status_check", "update_report", "spam"] },
        create_ticket: { type: Type.BOOLEAN }
      },
      required: ["intent"]
    },
    case_object: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        category: { type: Type.STRING },
        urgency: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
        location: { type: Type.STRING },
        summary: { type: Type.STRING },
        agency: { type: Type.STRING, enum: AGENCIES },
        sentiment: { type: Type.STRING, enum: ["positive", "neutral", "negative"] }
      }
    },
    agency_alert: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        send_sms: { type: Type.BOOLEAN },
        agency: { type: Type.STRING },
        ticket_id: { type: Type.STRING },
        summary: { type: Type.STRING },
        location: { type: Type.STRING }
      }
    }
  },
  required: ["user_message", "internal_actions"]
};

// Simple health and root endpoints
app.get('/', (req, res) => {
  res.send('PulseAI backend is running. POST /webhook for Twilio messages.');
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Main Webhook Route for WhatsApp
app.post('/webhook', async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;

  console.log(`Received message from ${from}: ${incomingMsg}`);

  try {
    const systemPrompt = `You are Kwara PulseAI, the official AI assistant for the Kwara State Government.
    Your goal is to help citizens report issues (water, roads, security, trash) via WhatsApp.
    
    1. Parse the user's message.
    2. Route to the correct agency from the list: ${JSON.stringify(AGENCIES)}.
    3. Determine urgency (High/Medium/Low).
    4. Provide a friendly, empathetic response in 'user_message'.
    `;

    // Call Gemini API
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: incomingMsg,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    const responseText = result.text;
    const parsed = JSON.parse(responseText);

    // Send Reply via Twilio
    await twilioClient.messages.create({
      from: 'whatsapp:+14155238886', // Your Twilio Sandbox Number
      to: from,
      body: parsed.user_message
    });

    // Handle Logic: Create Ticket & Alert Agency
    if (parsed.internal_actions.intent === 'new_report' && parsed.agency_alert?.send_sms) {
       console.log("Creating Ticket in Database...");
       // await database.createTicket(parsed.case_object);

       console.log(`SENDING AGENCY ALERT SMS to ${parsed.agency_alert.agency}: ${parsed.agency_alert.summary}`);
       // await twilioClient.messages.create({ to: AGENCY_PHONE, body: ... });
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error("Error processing message:", error);
    // Send fallback message
    await twilioClient.messages.create({
      from: 'whatsapp:+14155238886',
      to: from,
      body: "I'm having a little trouble connecting to the server right now. Please try again in a moment."
    });
    res.status(200).send('Error handled');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
