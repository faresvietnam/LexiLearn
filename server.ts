import dotenv from "dotenv";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import imagePresignFunction from "./api/images/presign";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Keep the Vercel Function reachable through the existing local dev command.
app.post("/api/images/presign", async (req, res) => {
  const response = await imagePresignFunction.fetch(new Request(
    "http://localhost:3000/api/images/presign",
    {
      method: "POST",
      headers: {
        authorization: req.header("authorization") ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify(req.body),
    },
  ));
  res.status(response.status).send(await response.text());
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
