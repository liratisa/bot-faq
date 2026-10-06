// const Groq = require("groq-sdk");
//const apiKey = process.env.GROQ_API_KEY;
//const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

// let client = null;
// if (apiKey && apiKey !== "coloque_sua_chave_aqui") {
//     client = new Groq({ apiKey });
// }

// async function classify(userText) {
//     if (!client) {
//         return { id: null, unidade: null, confianca: 0, aiUnavailable: true };
//     }

//     try {
//         const completion = await client.chat.completions.create({
//             model,
//             temperature: 0,
//             max_tokens: 150,
//             response_format: { type: "json_object" },
//             messages: [
//                 { role: "system", content: buildSystemPrompt() },
//                 { role: "user", content: userText.slice(0, 1000) },
//             ],
//         });

//         const text = completion.choices?.[0]?.message?.content || "{}";
//         const parsed = JSON.parse(text);

//         const knownIds = kb.getKnownIds();
//         const id = knownIds.includes(parsed.id) ? parsed.id : null;
//         const unidade = ["TRF2", "JFRJ", "JFES"].includes(parsed.unidade) ? parsed.unidade : null;
//         const confianca = typeof parsed.confianca === "number" ? parsed.confianca : 0;

//         return { id, unidade, confianca };
//     } catch (err) {
//         console.error("[intentClassifier] erro ao classificar:", err.message);
//         return { id: null, unidade: null, confianca: 0, aiError: true };
//     }
// }

"use strict";

const axios = require("axios");
const https = require("https");
const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_API_MODEL;

const kb = require("./knowledgeBase");

function buildSystemPrompt() {
    const ids = kb.getKnownIds();

    const catalog = ids
        .map((id) => {
            const meta = kb.getMenuMeta(id);
            return `- "${id}": ${meta.label} (palavras relacionadas: ${meta.keywords.join(", ")})`;
        })
        .join("\n");

    return `Você é um classificador de assunto para um chatbot de FAQ da Justiça Federal da 2ª Região (TRF2, JFRJ, JFES).

Sua ÚNICA tarefa é classificar o texto do usuário em três eixos:
1. QUAL assunto, entre os listados abaixo (eles correspondem exatamente aos conteúdos que existem na base de conhecimento);
2. QUAL unidade (TRF2, JFRJ ou JFES), se der para saber;
3. QUAL a intenção da mensagem: "assunto", "saudacao", "despedida", "menu", "suporte" ou "outro".

Você NUNCA responde à dúvida do usuário, NUNCA gera texto explicativo, NUNCA inventa informação. Apenas classifica.
Você NÃO avalia o tom da mensagem nem tenta descobrir se é uma dúvida, um erro ou uma reclamação: escolha apenas o assunto da lista que mais se relaciona ao texto. Por exemplo, "não estou conseguindo consultar meu processo" deve ser classificado no assunto de consulta de processos, como qualquer outra mensagem sobre esse tema.

Assuntos possíveis (use exatamente estes ids):
${catalog}

Responda SOMENTE com um JSON válido, sem markdown, sem texto extra, no formato:
{"id": "<um dos ids acima ou null se não identificar>", "unidade": "<TRF2|JFRJ|JFES ou null>", "intencao": "<assunto|saudacao|despedida|menu|suporte|outro>", "confianca": <número de 0 a 1>}

Regras:
- Classifique SOMENTE entre os assuntos da lista acima. Se o texto não corresponder claramente a nenhum deles, retorne "id": null.
- Só preencha "unidade" se o usuário citou claramente TRF2, Rio de Janeiro/JFRJ ou Espírito Santo/JFES (ou cidades dessas seções). Caso contrário, "unidade": null.
- Nunca crie um id que não esteja na lista.
- "intencao": use "assunto" quando a mensagem tratar de um dos assuntos da lista (e então preencha o "id"); "saudacao" SOMENTE quando a mensagem for apenas um cumprimento ou gentileza de abertura (oi, olá, bom dia, e aí, tudo bem?); "despedida" SOMENTE quando for apenas uma despedida ou agradecimento de encerramento (tchau, até logo, valeu, obrigado, era só isso); "menu" quando o usuário pedir para ver o menu, as opções ou recomeçar; "outro" para qualquer coisa que não se encaixe.
- "suporte" é uma exceção restrita: use quando o usuário relatar dificuldade para ENTRAR, ACESSAR ou fazer LOGIN no sistema (senha, login, acesso negado, "não consigo entrar"), mesmo que diga ser perito, advogado etc. e desde que NÃO esteja perguntando como se cadastrar. Nesse caso "id": null. (Isso não muda a regra acima: problemas para consultar processo, emitir custas etc. continuam classificados no assunto correspondente.)
- Se a mensagem trouxer um assunto da lista junto com um cumprimento, use "assunto" e preencha o "id".`;
}

/**
 * Conexao HTTPS dedicada para a chamada a IA.
 * O erro intermitente "EPROTO" (falha no handshake TLS) costuma acontecer
 * quando o Node reaproveita uma conexao keep-alive que o servidor/proxy ja
 * derrubou, ou quando a rota IPv6 falha. Por isso: cada tentativa abre uma
 * conexao nova (keepAlive: false), forca IPv4 e exige TLS 1.2+.
 */
const httpsAgent = new https.Agent({
    keepAlive: false,
    family: 4,
    minVersion: "TLSv1.2",
});

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 600;
const REQUEST_TIMEOUT_MS = 30000;

// Falhas transitorias de rede/servidor em que vale tentar de novo
const RETRYABLE_CODES = new Set(["EPROTO", "ECONNRESET", "EPIPE", "EAI_AGAIN", "ECONNREFUSED", "ERR_SSL_WRONG_VERSION_NUMBER"]);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function isRetryable(err) {
    if (err && RETRYABLE_CODES.has(err.code)) return true;
    const status = err && err.response && err.response.status;
    return RETRYABLE_STATUS.has(status);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Aceita a chave com ou sem o prefixo "Bearer " no .env
function authHeader() {
    const key = (apiKey || "").trim();
    return /^bearer\s/i.test(key) ? key : `Bearer ${key}`;
}

async function requestWithRetry(config) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await axios.request(config);
        } catch (err) {
            lastErr = err;
            if (attempt < MAX_ATTEMPTS && isRetryable(err)) {
                console.warn(
                    `[intentClassifier] tentativa ${attempt}/${MAX_ATTEMPTS} falhou (${err.code || (err.response && err.response.status) || err.message}); tentando novamente...`,
                );
                await sleep(RETRY_DELAY_MS * attempt);
                continue;
            }
            break;
        }
    }
    throw lastErr;
}

// Alguns modelos devolvem o JSON dentro de ```json ... ``` ou com texto em volta; extrai so o objeto.
function parseJsonLoose(text) {
    const cleaned = String(text)
        .replace(/```(?:json)?/gi, "")
        .trim();
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        const a = cleaned.indexOf("{");
        const b = cleaned.lastIndexOf("}");
        if (a !== -1 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
        throw e;
    }
}

async function classify(userText) {
    let data = JSON.stringify({
        model: model,
        messages: [
            {
                role: "user",
                content: userText.slice(0, 1000),
            },
            {
                role: "system",
                content: buildSystemPrompt(),
            },
        ],
        reasoning: {
            enabled: true,
        },
    });

    let config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: {
            "Content-Type": "application/json",
            Authorization: authHeader(),
        },
        data: data,
        httpsAgent,
        timeout: REQUEST_TIMEOUT_MS,
    };

    try {
        const response = await requestWithRetry(config);
        const text = response.data.choices?.[0]?.message?.content || "{}";
        const parsed = parseJsonLoose(text);
        console.log(text, parsed);
        const knownIds = kb.getKnownIds();
        const id = knownIds.includes(parsed.id) ? parsed.id : null;
        const unidade = ["TRF2", "JFRJ", "JFES"].includes(parsed.unidade) ? parsed.unidade : null;
        const confianca = typeof parsed.confianca === "number" ? parsed.confianca : 0;
        const intencao = ["assunto", "saudacao", "despedida", "menu", "suporte", "outro"].includes(parsed.intencao) ? parsed.intencao : "outro";
        return { id, unidade, confianca, intencao };
    } catch (err) {
        console.log(userText);
        console.error("[intentClassifier] erro ao classificar:", err.code ? `${err.code} - ${err.message}` : err.message);
        return { id: null, unidade: null, confianca: 0, aiError: true };
    }
}

module.exports = { classify };
