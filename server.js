"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const sessionStore = require("./src/session");
const chatEngine = require("./src/chatEngine");

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());

app.use(
    cors({
        origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
    }),
);
app.use(express.json({ limit: "100kb" }));

// Serve o script do widget e assets estaticos (embutidos no site da JF)
app.use("/widget", express.static(path.join(__dirname, "public")));

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true }));

/**
 * Inicia uma nova conversa. O front-end deve chamar isso quando o
 * usuario clica no icone do widget pela primeira vez.
 */
app.post("/api/start", (req, res) => {
    const sessionId = uuidv4();
    const session = sessionStore.getSession(sessionId);
    const messages = chatEngine.handleStart(session);
    res.json({ sessionId, messages });
});

/**
 * Envia uma mensagem do usuario e recebe a(s) resposta(s) do bot.
 * Body: { sessionId: string, message: string }
 */
app.post("/api/chat", async (req, res) => {
    try {
        const { sessionId, message } = req.body || {};
        if (!sessionId || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "sessionId e message são obrigatórios." });
        }

        const session = sessionStore.getSession(sessionId);
        const messages = await chatEngine.handleIncoming(session, message.trim());
        res.json({ messages });
    } catch (err) {
        console.error("[POST /api/chat] erro:", err);
        res.status(500).json({
            error: "Erro interno.",
            messages: [{ text: "Ocorreu um erro por aqui... Por favor, tente novamente em instantes." }],
        });
    }
});

app.listen(PORT, () => {
    console.log(`JF2 FAQ Bot rodando em http://localhost:${PORT}`);
    console.log(`Script do widget: http://localhost:${PORT}/widget/widget.js`);
});
