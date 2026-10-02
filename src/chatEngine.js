"use strict";

const kb = require("./knowledgeBase");
const contactDirectory = require("./contactDirectory");
const intentClassifier = require("./intentClassifier");
const logger = require("./logger");

// Respostas a "Deseja visualizar mais alguma coisa?"
const YES_WORDS = ["sim", "s", "yes", "quero", "pode", "claro", "ajuda", "gostaria"];
const NO_WORDS = ["não", "nao", "n", "no", "não precisa", "nao precisa", "obrigado", "obrigada", "só isso", "so isso"];

// Respostas a "O conteúdo te ajudou?" (aqui "obrigado" significa que ajudou)
const HELPED_YES_WORDS = ["sim", "s", "yes", "ajudou", "ajudou sim", "resolveu", "obrigado", "obrigada"];
const HELPED_NO_WORDS = ["nao", "n", "no", "nao ajudou", "nao resolveu"];

// minusculas, sem acentos e sem pontuacao final ("Não!" -> "nao")
function normalize(str) {
    return (str || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/[.!?,;:]+$/, "")
        .trim()
        .toLowerCase();
}

function isYes(text) {
    const c = normalize(text);
    return YES_WORDS.includes(c);
}
function isNo(text) {
    const c = normalize(text);
    return NO_WORDS.includes(c);
}
function isHelpedYes(text) {
    return HELPED_YES_WORDS.includes(normalize(text));
}
function isHelpedNo(text) {
    return HELPED_NO_WORDS.includes(normalize(text));
}

// ---------------------------------------------------------------------
// Intencoes simples, reconhecidas por codigo (sem IA) em QUALQUER etapa:
// "menu", saudacoes ("oi", "bom dia"...) e despedidas ("tchau", "obrigado"...).
// Para acrescentar palavras, basta editar as listas abaixo.
// Tudo e comparado sem acentos, sem pontuacao e em minusculas. A mensagem
// inteira precisa ser composta so por essas palavras: "oi, quero o telefone
// de niteroi" NAO e saudacao - segue o fluxo normal (menu/IA).
// ---------------------------------------------------------------------

// Frases que pedem o menu (mensagem inteira) - alem de qualquer frase curta com a palavra "menu"
const MENU_PHRASES = [
    "menu",
    "menu principal",
    "inicio",
    "voltar",
    "voltar ao inicio",
    "voltar ao menu",
    "voltar pro menu",
    "opcoes",
    "ver opcoes",
    "mostrar opcoes",
    "quais as opcoes",
    "recomecar",
    "comecar",
    "comecar de novo",
    "reiniciar",
    "principal",
];

// Saudacoes: a mensagem so pode conter estas palavras, e ao menos um "gatilho"
const GREETING_FILLER = new Set([
    "tudo",
    "td",
    "bem",
    "bom",
    "boa",
    "dia",
    "tarde",
    "noite",
    "certo",
    "e",
    "ai",
    "ae",
    "fala",
    "pessoal",
    "gente",
    "turma",
    "amigo",
    "amiga",
    "bot",
    "assistente",
    "como",
    "vai",
    "voce",
    "vc",
]);
function isGreetingTrigger(tok) {
    return /^o+i+e*$/.test(tok) || /^ol+a+$/.test(tok) || ["opa", "eai", "hey", "hello", "hi", "salve", "alo", "oie", "eae"].includes(tok);
}

// Despedidas / agradecimentos
const FAREWELL_TRIGGERS = new Set(["tchau", "tchauzinho", "xau", "adeus", "flw", "falou", "valeu", "vlw", "obrigado", "obrigada", "brigado", "brigada", "obg", "agradeco", "ate"]);
const FAREWELL_FILLER = new Set([
    "muito",
    "muitissimo",
    "mto",
    "mt",
    "ok",
    "okay",
    "ta",
    "certo",
    "entao",
    "pra",
    "por",
    "tudo",
    "tenha",
    "um",
    "uma",
    "bom",
    "boa",
    "dia",
    "tarde",
    "noite",
    "logo",
    "mais",
    "amanha",
    "breve",
    "proxima",
    "ajuda",
    "a",
    "o",
    "e",
    "voces",
    "voce",
    "vc",
    "gente",
    "pessoal",
    "fique",
    "com",
    "deus",
    "ate",
]);
const FAREWELL_PHRASES = [
    "so isso",
    "e so isso",
    "era so isso",
    "por hoje e so",
    "por hoje so",
    "nada mais",
    "nao preciso de mais nada",
    "nao quero mais nada",
    "tenho mais nada",
    "pode encerrar",
    "encerrar",
    "sair",
    "fim",
    "finalizar",
    "encerrar conversa",
    "acabou",
    "ja deu",
    "ja resolvi",
    "era isso",
    "e isso",
];

// "Oi, tudo bem?!" -> ["oi", "tudo", "bem"]
function wordsOf(text) {
    return normalize(text)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

/** Retorna "menu" | "farewell" | "greeting" | null para a mensagem digitada. */
function detectSimpleIntent(text) {
    const toks = wordsOf(text);
    if (toks.length === 0 || toks.length > 6) return null;
    const joined = toks.join(" ");

    // menu: frase pronta, ou frase curta (ate 5 palavras) contendo "menu"
    if (MENU_PHRASES.includes(joined) || (toks.includes("menu") && toks.length <= 5)) return "menu";

    // despedida: frase pronta, ou so palavras de despedida com ao menos um gatilho
    if (FAREWELL_PHRASES.includes(joined)) return "farewell";
    if (toks.some((t) => FAREWELL_TRIGGERS.has(t)) && toks.every((t) => FAREWELL_TRIGGERS.has(t) || FAREWELL_FILLER.has(t))) {
        return "farewell";
    }

    // saudacao: so palavras de saudacao, com ao menos um gatilho ("oi", "ola", "bom dia"...)
    const hasTrigger = toks.some(isGreetingTrigger) || /(^| )(bom dia|boa tarde|boa noite|e ai|e ae|fala ai)( |$)/.test(joined);
    if (hasTrigger && toks.every((t) => isGreetingTrigger(t) || GREETING_FILLER.has(t))) return "greeting";

    return null;
}

/**
 * Em algumas etapas a propria etapa ja da outro significado a essas palavras
 * (ex.: "obrigado" em "O conteudo te ajudou?" significa SIM). Nelas, a
 * resposta da etapa tem prioridade sobre a deteccao acima.
 */
function stateClaimsInput(state, text, intent) {
    if (state === "awaiting_satisfaction") return isHelpedYes(text) || isHelpedNo(text);
    if (state === "awaiting_more_help") return isYes(text) || isNo(text);
    // motivo em texto livre: "obrigado"/"tchau" contam como o motivo (segue para o contato do chamado)
    if (state === "awaiting_feedback_reason") return intent === "farewell";
    return false;
}

function resetToMenuState(session) {
    session.state = "menu";
    session.pendingId = null;
    session.forceAi = false;
    session.contactResults = [];
}

function handleSimpleIntent(session, intent) {
    if (intent === "menu") {
        resetToMenuState(session);
        return {
            messages: greetingMessages().slice(1), // so o menu
            matchedId: null,
            unidade: null,
            matchMethod: "menu",
            confidence: null,
        };
    }
    if (intent === "greeting") {
        resetToMenuState(session);
        return {
            messages: greetingMessages(),
            matchedId: null,
            unidade: null,
            matchMethod: "system",
            confidence: null,
        };
    }
    // farewell
    session.state = "closed";
    session.pendingId = null;
    session.forceAi = false;
    return {
        messages: [{ text: closingMessage() }],
        matchedId: null,
        unidade: null,
        matchMethod: "system",
        confidence: null,
    };
}

function menuText() {
    const items = kb.getMenuItems();
    const lines = items.map((it) => `**${it.number}**. ${it.label}`);
    return lines.join("\n");
}

function greetingMessages() {
    return [
        {
            text: "Olá! 👋 Sou o assistente virtual da Justiça Federal da 2ª Região.\n\n" + "Posso ajudar com dúvidas sobre os Sistemas Processuais.",
        },
        {
            text: "Selecione uma opção abaixo ou digite sua dúvida:\n\n" + menuText() + "\n\n*💡Você pode retornar para as opções a qualquer momento, basta digitar **menu**.*",
        },
    ];
}

function satisfactionMessage() {
    return {
        text: "O conteúdo te ajudou?",
        buttons: [
            { text: "Sim", value: "sim" },
            { text: "Não", value: "não" },
        ],
    };
}

function moreHelpMessage() {
    return {
        text: "Que bom! 🙂 Deseja informações sobre outro assunto?",
        buttons: [
            { text: "Sim", value: "sim" },
            { text: "Não", value: "não" },
        ],
    };
}

function feedbackReasonMessage() {
    return "Sinto muito. 😕\nPode me contar, em poucas palavras, qual foi o motivo?";
}

// Contato para abertura de chamado (link do formulário + telefone)
function centralContactMessage() {
    const info = kb.CHAMADO_INFO;
    return (
        "Agradeço por explicar. Para que nossa equipe possa te ajudar da melhor forma, escolha uma das opções abaixo:\n\n" +
        `📝 Formulário: ${info.formulario}\n` +
        `📞 Telefone: ${info.telefone}`
    );
}

function ticketClosingMessage() {
    return "Obrigado por utilizar o assistente virtual. Até logo! 👋";
}

function notUnderstoodMessage() {
    return "Desculpe, não entendi... 😕 Por favor, digite novamente, com outras palavras, ou escolher uma das opções abaixo:\n" + menuText();
}

// Problema de acesso/login (ou outro caso sem conteudo na base): encaminha para a Central de Atendimento
function supportMessages(session) {
    const info = kb.CHAMADO_INFO;
    session.state = "menu";
    session.pendingId = null;
    session.forceAi = false;
    return [
        {
            text:
                "Entendi a sua situação. 😕 Para esse tipo de problema não tenho uma orientação pronta, mas a equipe da Central de Atendimento pode te ajudar. Abra um chamado pelo formulário ou ligue:\n\n" +
                `• Formulário: ${info.formulario}\n` +
                `• Telefone: ${info.telefone}`,
        },
        { text: "Se precisar de outro assunto, é só digitar **menu**." },
    ];
}

// Plano B quando a IA esta fora do ar: reconhece por palavras um relato de problema de acesso
function looksLikeAccessProblem(text) {
    const t = normalize(text);
    const problema = /(nao consigo|nao estou conseguindo|nao consegui|sem conseguir|nao consegue|erro|problema|dificuldade|travou|bloquead|negado|esqueci|nao funciona)/.test(t);
    const acesso = /(entrar|acessar|acesso|logar|login|senha|usuario e senha)/.test(t);
    return problema && acesso;
}

function closingMessage() {
    return "Se precisar, estarei por aqui. Até mais! 👋";
}

function unidadeSubmenu(session, id) {
    const availableUnidades = kb.getUnidadesFor(id);
    session.state = "awaiting_unidade";
    session.pendingId = id;
    session.unidadeOptions = availableUnidades;

    const lines = availableUnidades.map((code, i) => `**${i + 1}**. ${kb.getUnidadeLabel(code)}`);
    return [
        {
            text: `Sobre qual unidade é a sua dúvida?\n\n${lines.join("\n")}`,
        },
    ];
}

// Submenu "Cadastro": lista os assuntos de cadastro (Jus Postulandi, perito, sociedade de advogados...)
function cadastroSubmenu(session) {
    const children = kb.getChildren("cadastro");
    session.state = "awaiting_cadastro";
    session.pendingId = "cadastro";

    const lines = children.map((c) => `**${c.number}**. ${c.label}`);
    return [
        {
            text: `Qual assunto de cadastro você deseja consultar?\n\n${lines.join("\n")}`,
        },
    ];
}

function contactQueryPrompt(session) {
    session.state = "awaiting_contact_query";
    return [
        {
            text: "Para localizar a unidade, digite o nome da vara/foro, a cidade ou o código dela.\n\n" + '*Exemplos: "Campos dos Goytacazes", "2ª Vara Federal", "02VF-CA".*',
        },
    ];
}

function contactChoicePrompt(session, results) {
    session.state = "awaiting_contact_choice";
    session.contactResults = results;
    const lines = results.map((r, i) => `**${i + 1}** - ${r.nome}${r.municipio ? " - " + r.municipio : ""}${r.uf ? "/" + r.uf : ""}`);
    return [
        {
            text: `Encontrei mais de uma unidade. Digite o número correspondente:\n\n${lines.join("\n")}`,
        },
    ];
}

/**
 * Entrega o conteudo (verbatim do JSON) e pergunta "O conteudo te ajudou?"
 * com botoes Sim/Nao. Guarda qual conteudo foi entregue (id + unidade) para
 * registrar no log a avaliacao do usuario.
 */
function deliverContentAndAskFeedback(session, text, id, unidade) {
    session.state = "awaiting_satisfaction";
    session.pendingId = null;
    session.forceAi = false;
    session.lastContent = { id: id || null, unidade: unidade || null };
    return [{ text }, satisfactionMessage()];
}

/** Resultado padrao das etapas de avaliacao (satisfacao / motivo / chamado). */
function feedbackResult(session, messages) {
    const last = session.lastContent || {};
    return {
        messages,
        matchedId: last.id || null,
        unidade: last.unidade || null,
        matchMethod: "feedback",
        confidence: null,
    };
}

/**
 * Dado um id (+ opcionalmente unidade) ja resolvido - seja por match de
 * menu, seja pela IA - decide o proximo passo: pedir unidade, pedir busca
 * de contato, ou entregar o conteudo informativo (sempre verbatim do JSON).
 */
function resolveAndRespond(session, id, unidade) {
    const meta = kb.getMenuMeta(id);

    if (meta.special === "cadastro") {
        return { messages: cadastroSubmenu(session), matchedId: id, unidade: null };
    }

    if (meta.special === "contato_unidade") {
        return { messages: contactQueryPrompt(session), matchedId: id, unidade: null };
    }

    if (meta.needsUnidade) {
        const available = kb.getUnidadesFor(id);
        if (unidade && available.includes(unidade)) {
            const resposta = kb.getResposta(id, unidade);
            return {
                messages: deliverContentAndAskFeedback(session, resposta, id, unidade),
                matchedId: id,
                unidade,
            };
        }
        return { messages: unidadeSubmenu(session, id), matchedId: id, unidade: null };
    }

    const resposta = kb.getResposta(id, null);
    return {
        messages: deliverContentAndAskFeedback(session, resposta, id, null),
        matchedId: id,
        unidade: null,
    };
}

/**
 * Tenta resolver texto livre: primeiro contra o menu (a nao ser que
 * forceAi esteja ativo), depois via IA (que so classifica entre os assuntos
 * existentes no conhecimento.json). Retorna o resultado no mesmo formato de
 * resolveAndRespond, ou fallback de "nao entendi".
 */
async function handleFreeText(session, text) {
    // Um numero do menu (ex.: "2") sempre vale, mesmo depois de um "nao entendi"
    const isNumberOnly = /^\s*\d+\s*$/.test(text);

    if (!session.forceAi || isNumberOnly) {
        const menuId = kb.matchMenuInput(text);
        if (menuId) {
            const result = resolveAndRespond(session, menuId, null);
            return { ...result, matchMethod: "menu", confidence: null };
        }
    }

    // Numero que nao existe no menu: nao precisa gastar uma chamada a IA
    const ai = isNumberOnly ? { id: null, unidade: null, confianca: 0, intencao: "outro" } : await intentClassifier.classify(text);

    if (ai?.id) {
        const result = resolveAndRespond(session, ai.id, ai.unidade);
        return { ...result, matchMethod: "ai", confidence: ai.confianca };
    }

    // Sem assunto, mas a IA percebeu saudacao / despedida / pedido de menu que a regra de palavras nao pegou
    const INTENT_FROM_AI = { saudacao: "greeting", despedida: "farewell", menu: "menu" };
    if (INTENT_FROM_AI[ai?.intencao] && (ai.confianca ?? 0) >= 0.6) {
        const result = handleSimpleIntent(session, INTENT_FROM_AI[ai.intencao]);
        return { ...result, matchMethod: "ai", confidence: ai.confianca };
    }

    // Problema de acesso/login: nao ha conteudo na base -> encaminha para a Central de Atendimento
    if ((ai?.intencao === "suporte" && (ai.confianca ?? 0) >= 0.6) || (ai?.aiError && looksLikeAccessProblem(text))) {
        return {
            messages: supportMessages(session),
            matchedId: "suporte",
            unidade: null,
            matchMethod: ai?.aiError ? "fallback" : "ai",
            confidence: ai?.confianca ?? 0,
        };
    }

    session.forceAi = true;

    return {
        messages: [{ text: notUnderstoodMessage() }],
        matchedId: null,
        unidade: null,
        matchMethod: "fallback",
        confidence: ai.confianca ?? 0,
    };
}

/**
 * Processa uma mensagem do usuario dado o estado atual da sessao.
 * Retorna { messages: [{text, buttons?}], matchedId, unidade, matchMethod, confidence }
 * (buttons: [{text, value}] - o widget mostra como botoes; o clique envia "value").
 */
async function processMessage(session, rawText) {
    const text = (rawText || "").toString().slice(0, 2000);

    // "menu", saudacoes e despedidas valem em qualquer etapa da conversa (antes do menu/IA)
    const simpleIntent = detectSimpleIntent(text);
    if (simpleIntent && !stateClaimsInput(session.state, text, simpleIntent)) {
        return handleSimpleIntent(session, simpleIntent);
    }

    switch (session.state) {
        // Submenu "Cadastro": escolhe o assunto (numero ou nome) e segue o fluxo normal (unidade -> conteudo)
        case "awaiting_cadastro": {
            const childId = kb.matchChildInput("cadastro", text);
            if (childId) {
                const result = resolveAndRespond(session, childId, null);
                return { ...result, matchMethod: "menu", confidence: null };
            }
            return {
                messages: [
                    {
                        text: "Não consegui identificar a opção. Por favor, digite o número ou o nome de uma das opções listadas.",
                    },
                ],
                matchedId: "cadastro",
                unidade: null,
                matchMethod: "fallback",
                confidence: null,
            };
        }

        case "awaiting_unidade": {
            const options = session.unidadeOptions || kb.getUnidadesFor(session.pendingId);
            let unidade = null;

            const asNumber = Number(text.trim());
            if (Number.isInteger(asNumber) && options[asNumber - 1]) {
                unidade = options[asNumber - 1];
            } else {
                unidade = kb.matchUnidadeInput(text, options);
            }

            if (unidade) {
                const resposta = kb.getResposta(session.pendingId, unidade);
                const id = session.pendingId;
                return {
                    messages: deliverContentAndAskFeedback(session, resposta, id, unidade),
                    matchedId: id,
                    unidade,
                    matchMethod: "menu",
                    confidence: null,
                };
            }

            return {
                messages: [
                    {
                        text: "Não consegui identificar a unidade. Por favor, digite o número ou o nome de uma das opções listadas.",
                    },
                ],
                matchedId: session.pendingId,
                unidade: null,
                matchMethod: "fallback",
                confidence: null,
            };
        }

        case "awaiting_contact_query": {
            const results = contactDirectory.search(text);
            if (results.length === 0) {
                return {
                    messages: [
                        {
                            text: "Não encontrei nenhuma unidade com esse termo. Tente novamente com o nome da cidade, da vara/foro, ou o código dela.",
                        },
                    ],
                    matchedId: "contato_unidade",
                    unidade: null,
                    matchMethod: "fallback",
                    confidence: null,
                };
            }
            if (results.length === 1) {
                const formatted = contactDirectory.formatContact(results[0]);
                return {
                    messages: deliverContentAndAskFeedback(session, formatted, "contato_unidade", null),
                    matchedId: "contato_unidade",
                    unidade: null,
                    matchMethod: "menu",
                    confidence: null,
                };
            }
            return {
                messages: contactChoicePrompt(session, results),
                matchedId: "contato_unidade",
                unidade: null,
                matchMethod: "menu",
                confidence: null,
            };
        }

        case "awaiting_contact_choice": {
            const idx = Number(text.trim()) - 1;
            const results = session.contactResults || [];
            if (Number.isInteger(idx) && results[idx]) {
                const formatted = contactDirectory.formatContact(results[idx]);
                return {
                    messages: deliverContentAndAskFeedback(session, formatted, "contato_unidade", null),
                    matchedId: "contato_unidade",
                    unidade: null,
                    matchMethod: "menu",
                    confidence: null,
                };
            }
            return {
                messages: [{ text: "Por favor, digite o número correspondente a uma das unidades listadas." }],
                matchedId: "contato_unidade",
                unidade: null,
                matchMethod: "fallback",
                confidence: null,
            };
        }

        // "O conteudo te ajudou?" [Sim] [Nao]
        case "awaiting_satisfaction": {
            if (isHelpedYes(text)) {
                // Ajudou -> "Deseja visualizar mais alguma coisa?"
                session.state = "awaiting_more_help";
                return feedbackResult(session, [moreHelpMessage()]);
            }
            if (isHelpedNo(text)) {
                // Nao ajudou -> pergunta o motivo (texto livre)
                session.state = "awaiting_feedback_reason";
                return feedbackResult(session, [{ text: feedbackReasonMessage() }]);
            }
            // Nem sim nem nao -> trata como uma nova pergunta
            session.state = "menu";
            return await handleFreeText(session, text);
        }

        // Motivo em texto livre -> contato para abertura de chamado -> despedida
        case "awaiting_feedback_reason": {
            session.state = "closed";
            return feedbackResult(session, [{ text: centralContactMessage() }, { text: ticketClosingMessage() }]);
        }

        case "awaiting_more_help": {
            if (isYes(text)) {
                session.state = "menu";
                session.forceAi = false;
                return {
                    messages: greetingMessages().slice(1), // so o menu, sem repetir a saudacao completa
                    matchedId: null,
                    unidade: null,
                    matchMethod: "menu",
                    confidence: null,
                };
            }
            if (isNo(text)) {
                session.state = "closed";
                return {
                    messages: [{ text: closingMessage() }],
                    matchedId: null,
                    unidade: null,
                    matchMethod: "menu",
                    confidence: null,
                };
            }
            // nao foi sim/nao -> trata como nova pergunta
            session.state = "menu";
            const result = await handleFreeText(session, text);
            return result;
        }

        case "closed": {
            // Conversa ja encerrada: a nova mensagem e tratada como inicio de um novo atendimento
            // (antes, qualquer texto aqui virava so a saudacao e a duvida era perdida).
            session.state = "menu";
            session.forceAi = false;
            const result = await handleFreeText(session, text);
            if (result.matchMethod === "fallback" && result.matchedId !== "suporte") {
                // nao deu para entender: recomeca com a saudacao + menu, como antes
                session.forceAi = false;
                return {
                    messages: greetingMessages(),
                    matchedId: null,
                    unidade: null,
                    matchMethod: "system",
                    confidence: null,
                };
            }
            return result;
        }

        case "menu":
        default: {
            return await handleFreeText(session, text);
        }
    }
}

/**
 * Ponto de entrada usado pelo servidor HTTP: processa a mensagem,
 * registra tudo no log de conversas e devolve as mensagens do bot.
 */
async function handleIncoming(session, userText) {
    logger.logMessage({ sessionId: session.id, sender: "user", message: userText });

    const result = await processMessage(session, userText);

    for (const msg of result.messages) {
        logger.logMessage({
            sessionId: session.id,
            sender: "bot",
            message: msg.text,
            matchedId: result.matchedId,
            unidade: result.unidade,
            matchMethod: result.matchMethod,
            confidence: result.confidence,
        });
    }

    return result.messages;
}

function handleStart(session) {
    const messages = greetingMessages();
    for (const msg of messages) {
        logger.logMessage({
            sessionId: session.id,
            sender: "bot",
            message: msg.text,
            matchMethod: "system",
        });
    }
    return messages;
}

module.exports = { handleIncoming, handleStart, processMessage };
