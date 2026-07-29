import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// AI Word Analysis endpoint using Gemini API
app.post("/api/ai/analyze-word", async (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== "string") {
      return res.status(400).json({ error: "Word parameter is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback mock enrichment if API key isn't provided
      return res.json({
        word: word.toLowerCase(),
        ipa: `/${word.toLowerCase()}/`,
        partOfSpeech: "noun",
        vietnameseMeaning: `Nghĩa của từ ${word}`,
        wordStructure: [
          { text: word.toLowerCase(), type: "root", meaning: word, order: 1 }
        ],
        meanings: [
          {
            meaning: `Nghĩa chính của ${word}`,
            partOfSpeech: "noun",
            examples: [
              {
                sentence: `This is an example sentence for ${word}.`,
                expectedAnswer: word,
                baseWord: word,
                wordForm: word,
                partOfSpeech: "noun",
                difficulty: "medium"
              }
            ]
          }
        ],
        wordFamily: [word]
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Analyze the English vocabulary word "${word}" for a Vietnamese learner.
Return a valid strictly formatted JSON object with no markdown surrounding code blocks.
The JSON must follow this exact TypeScript interface structure:
{
  "word": string,
  "ipa": string,
  "partOfSpeech": string (e.g. "noun", "verb", "adjective", "adverb"),
  "vietnameseMeaning": string,
  "wordStructure": Array<{
    "text": string,
    "type": "prefix" | "root" | "base" | "suffix" | "combining_form" | "compound_component",
    "meaning": string,
    "order": number
  }>,
  "meanings": Array<{
    "meaning": string (in Vietnamese),
    "partOfSpeech": string,
    "examples": Array<{
      "sentence": string (English sentence containing the target word),
      "expectedAnswer": string (the exact target word or word form as used in sentence),
      "baseWord": string (the dictionary base form),
      "wordForm": string,
      "partOfSpeech": string,
      "difficulty": "easy" | "medium" | "hard"
    }>
  }>,
  "wordFamily": string[] (related words, e.g. transport, transportation, transporter)
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text || "{}";
    const cleanedText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleanedText);

    return res.json(data);
  } catch (error: any) {
    console.error("Error analyzing word with Gemini:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze word" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
