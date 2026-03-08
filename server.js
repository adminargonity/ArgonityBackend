const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");
const nodemailer = require("nodemailer");
const cors = require("cors");
const fs = require("fs"); // Built-in Node file system
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Configure Email (Existing)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const rawData = fs.readFileSync(path.join(__dirname, "knowledge.json"));
const jsonData = JSON.parse(rawData);

// Convert to string for the AI prompt
const companyContext = JSON.stringify(jsonData);
/**
 * HELPER: Function to extract text from your PDF
 */
// async function getKnowledgeFromPDF() {
//   return new Promise((resolve, reject) => {
//     const pdfParser = new PDFParser(null, 1); // "1" means extract text only

//     pdfParser.on("pdfParser_dataError", (errData) => {
//       console.error("PDF Error:", errData.parserError);
//       resolve("Company info unavailable.");
//     });

//     pdfParser.on("pdfParser_dataReady", (pdfData) => {
//       // This extracts the raw text from the PDF pages
//       const text = pdfParser.getRawTextContent();
//       console.log("✅ PDF Successfully Parsed with pdf2json");
//       resolve(text);
//     });

//     const filePath = path.join(__dirname, "knowledge.pdf");

//     if (fs.existsSync(filePath)) {
//       pdfParser.loadPDF(filePath);
//     } else {
//       console.error("❌ File not found:", filePath);
//       resolve("Knowledge base file missing.");
//     }
//   });
// }

/**
 * Endpoint: AI Chat with PDF Knowledge
 */
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  //   try {
  //     const pdfText = await getKnowledgeFromPDF();

  //     // We use Claude-3-Haiku (Fastest & Cheapest) or Claude-3.5-Sonnet (Smartest)
  //     const msg = await anthropic.messages.create({
  //       model: "claude-3-haiku-20240307",
  //       max_tokens: 1024,
  //       system: `You are the Argonity AI Assistant. Use this company data: ${pdfText}`,
  //       messages: [{ role: "user", content: message }],
  //     });

  //     const aiResponse = chatCompletion.choices[0]?.message?.content || "";

  //     // Log success to Discord
  //     await axios.post(process.env.DISCORD_WEBHOOK_URL_CHAT, {
  //       embeds: [
  //         {
  //           title: "🤖 Argonity AI (Groq Success)",
  //           fields: [
  //             { name: "User", value: message },
  //             { name: "AI", value: aiResponse },
  //           ],
  //           color: 5814783,
  //         },
  //       ],
  //     });

  //     // Send the successful response back to the app
  //     return res.status(200).json({ reply: aiResponse });
  //   } catch (error) {
  //     console.error("Claude Error:", error.message);
  //   }

  //   try {
  //     // 1. Get the text from your PDF
  //     const pdfText = await getKnowledgeFromPDF();

  //     // 2. Build the system prompt
  //     const systemPrompt = `
  //         You are the Argonity AI Assistant.
  //         Use the following information from our company PDF to answer the user accurately.
  //         If the answer is not in the text, ask them to contact soenyuntaungargonity@gmail.com.

  //         COMPANY PDF DATA:
  //         ${pdfText}
  //     `;

  //     // --- TRY 1: GROQ ---
  //     const chatCompletion = await groq.chat.completions.create({
  //       messages: [
  //         { role: "system", content: systemPrompt },
  //         { role: "user", content: message },
  //       ],
  //       model: "llama-3.1-8b-instant",
  //     });

  //     const aiResponse = chatCompletion.choices[0]?.message?.content || "";

  //     // Log success to Discord
  //     await axios.post(process.env.DISCORD_WEBHOOK_URL_CHAT, {
  //       embeds: [
  //         {
  //           title: "🤖 Argonity AI (Groq Success)",
  //           fields: [
  //             { name: "User", value: message },
  //             { name: "AI", value: aiResponse },
  //           ],
  //           color: 5814783,
  //         },
  //       ],
  //     });

  //     // Send the successful response back to the app
  //     return res.status(200).json({ reply: aiResponse });
  //   } catch (groqError) {
  //     console.log("Groq Failed, switching to OpenRouter Fallback...");

  try {
    // --- TRY 2: OPENROUTER (Claude via Bridge) ---

    const openRouterRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "anthropic/claude-3.5-sonnet", // Or keep "openrouter/auto"
        messages: [
          { role: "system", content: `Info: ${companyContext}` },
          { role: "user", content: message },
        ],
        max_tokens: 500, // <--- ADD THIS LINE (Reduced from default 8192)
      },
      {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      },
    );

    // FIX HERE: Added .data before .choices
    const aiResponse = openRouterRes.data.choices[0]?.message?.content || "";

    // Ensure we have a string to send, even if AI failed
    const safeResponse =
      typeof aiResponse === "string" && aiResponse.length > 0
        ? aiResponse.substring(0, 1000)
        : "Error: No response generated.";

    await axios
      .post(process.env.DISCORD_WEBHOOK_URL_CHAT, {
        embeds: [
          {
            title: "🤖 Argonity AI Log",
            fields: [
              {
                name: "User Message",
                value: message.substring(0, 1000) || "Empty message",
              },
              {
                name: "AI Response",
                value: safeResponse,
              },
            ],
            color: 5814783, // Decimal for a nice blue
            footer: { text: `Provider: ${aiResponse ? "OpenRouter" : "None"}` },
          },
        ],
      })
      .catch((err) => console.error("Discord Webhook failed:", err.message));
    // Don't forget to send the response to the user!
    return res.status(200).json({ reply: aiResponse });
  } catch (fallbackError) {
    console.error(
      "ALL PROVIDERS FAILED:",
      fallbackError.response?.data || fallbackError.message,
    );

    return res.status(500).json({
      reply:
        "My circuits are currently calibrating. Please try again in 10 seconds!",
    });
  }
});

/**
 * Endpoint 2: Traditional Contact Form
 */
app.post("/api/contact", async (req, res) => {
  const { name, email, phone, message } = req.body;
  try {
    await axios.post(process.env.DISCORD_WEBHOOK_URL, {
      content: `🚀 **New Inquiry!**`,
      embeds: [
        {
          title: `From: ${name}`,
          description: message,
          fields: [
            { name: "Email", value: email, inline: true },
            { name: "Phone", value: phone || "N/A", inline: true },
          ],
          color: 5814783,
        },
      ],
    });

    await transporter.sendMail({
      from: `"Argonity" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: `New Inquiry from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`,
    });

    res.status(200).json({ success: true, message: "Sent!" });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// At the bottom of server.js
const port = process.env.PORT || 3000;

// Only start the server if we are running locally (XAMPP/Windows)
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// ALWAYS export the app for Vercel
module.exports = app;
