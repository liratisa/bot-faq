"use strict";

const kb = require("./knowledgeBase");

function normalize(str) {
    return (str || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove acentos
        .toLowerCase()
        .trim();
}

// Palavras que aparecem em frases como "quero o telefone de sao goncalo" mas
// nao identificam uma unidade. Sao ignoradas na comparacao por palavras.
const STOPWORDS = new Set([
    "a",
    "as",
    "o",
    "os",
    "um",
    "uma",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "para",
    "pra",
    "por",
    "com",
    "que",
    "qual",
    "quais",
    "me",
    "meu",
    "minha",
    "eu",
    "quero",
    "queria",
    "preciso",
    "gostaria",
    "saber",
    "favor",
    "passa",
    "passar",
    "informar",
    "informe",
    "informa",
    "telefone",
    "telefones",
    "fone",
    "contato",
    "contatos",
    "endereco",
    "enderecos",
    "email",
    "emails",
    "whatsapp",
    "zap",
    "numero",
    "onde",
    "fica",
    "ficam",
    "esta",
    "estao",
    "tem",
    "ha",
    "vara",
    "varas",
    "federal",
    "federais",
    "foro",
    "foros",
    "unidade",
    "unidades",
    "juizado",
    "secao",
]);

/** Quebra o texto (ja normalizado) em palavras, preservando hifen (codigos como "02vf-ca"). */
function tokenize(normalized) {
    return normalized.split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
}

/** "frase" aparece em "texto" como palavra(s) inteira(s)? (evita "rio" casar dentro de "itaborai") */
function containsPhrase(text, phrase) {
    if (!phrase) return false;
    return ` ${tokenize(text).join(" ")} `.includes(` ${tokenize(phrase).join(" ")} `);
}

/**
 * Busca unidades (varas/foros) pelo texto livre do usuario, comparando
 * com nome, municipio, codigo e uf. Retorna no maximo 5 resultados.
 * Nao usa IA: e um match textual simples sobre os dados do JSON.
 *
 * Precisao: se o texto digitado CONTEM o municipio, o nome ou o codigo de
 * uma unidade (ex.: "quero o telefone de sao goncalo"), esse e um acerto
 * FORTE e so as unidades com o acerto mais especifico sao devolvidas - nao
 * as que apenas compartilham uma palavra (como "sao"). Quando nao ha acerto
 * forte, vale a busca aproximada de antes (parte do nome/municipio), agora
 * ignorando palavras genericas.
 */
function search(query) {
    const q = normalize(query);
    if (!q) return [];

    const contacts = kb.getContacts();
    const qTokens = tokenize(q);
    const significant = qTokens.filter((t) => t.length > 2 && !STOPWORDS.has(t));

    const scored = [];

    for (const c of contacts) {
        const nome = normalize(c.nome);
        const municipio = normalize(c.municipio);
        const codigo = normalize(c.codigo);
        const uf = normalize(c.uf);

        // --- acerto forte: a unidade foi citada por inteiro no texto ---
        let strong = 0;
        if (codigo && qTokens.includes(codigo)) strong = Math.max(strong, 1000 + codigo.length);
        // o nome so conta como acerto forte se nao for "prefixo" do nome de outra unidade
        // (ex.: "2ª VARA FEDERAL" esta dentro de "2ª VARA FEDERAL DE NITEROI": ai a busca e ambigua)
        const nomeEhUnico = contacts.every((o) => o === c || !normalize(o.nome).includes(nome));
        if (nome && nomeEhUnico && containsPhrase(q, nome)) strong = Math.max(strong, 100 + nome.length);
        if (municipio && containsPhrase(q, municipio)) strong = Math.max(strong, 100 + municipio.length);

        // --- acerto aproximado (comportamento anterior) ---
        let score = 0;
        if (nome.includes(q)) score += 3;
        if (municipio.includes(q)) score += 3;
        if (codigo === q) score += 5;
        if (uf === q) score += 1;
        const palavrasDaUnidade = new Set(tokenize(`${nome} ${municipio}`));
        if (significant.some((tok) => palavrasDaUnidade.has(tok))) score += 1;

        if (strong > 0 || score > 0) scored.push({ entry: c, strong, score });
    }

    // Se alguma unidade foi citada por inteiro, fica so com a(s) mais especifica(s)
    const bestStrong = Math.max(0, ...scored.map((s) => s.strong));
    if (bestStrong > 0) {
        return scored
            .filter((s) => s.strong === bestStrong)
            .slice(0, 5)
            .map((s) => s.entry);
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map((s) => s.entry);
}

/** Formata um registro de contato em texto legivel, SEM alterar os dados. */
function formatContact(entry) {
    const lines = [];

    entry = entry
        .toLowerCase()
        .split(" ")
        .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
        .join(" ");

    lines.push(`**${entry.nome}**`);
    if (entry.municipio || entry.uf) {
        lines.push(`${entry.municipio || ""}${entry.municipio && entry.uf ? " - " : ""}${entry.uf || ""}\n`);
    }
    if (Array.isArray(entry.competencia) && entry.competencia.length) {
        lines.push(`• Competência: ${entry.competencia.join(", ")}`);
    }
    if (entry.endereco) {
        lines.push(`• Endereço: ${entry.endereco}${entry.complemento ? " - " + entry.complemento : ""}`);
    }
    if (Array.isArray(entry.telefones) && entry.telefones.length) {
        lines.push(`• Telefone(s): ${entry.telefones.join(" | ")}`);
    }
    if (Array.isArray(entry.whatsapp) && entry.whatsapp.length) {
        lines.push(`• WhatsApp: ${entry.whatsapp.join(" | ")}`);
    }
    if (Array.isArray(entry.emails) && entry.emails.length) {
        lines.push(`• E-mail: ${entry.emails.join(" | ")}`);
    }
    if (entry.balcao_virtual) {
        lines.push(`• Balcão virtual: ${entry.balcao_virtual}`);
    }
    return lines.join("\n");
}

module.exports = { search, formatContact };
