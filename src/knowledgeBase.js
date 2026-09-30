"use strict";

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "conhecimento.json");

/**
 * Metadados de exibicao para cada "id" do conhecimento.json.
 * IMPORTANTE: isso so controla como o item aparece no MENU (rotulo,
 * numero, palavras-chave para digitacao livre). O texto da resposta em
 * si NUNCA e alterado - ele vem sempre, literalmente, do JSON.
 *
 * "needsUnidade": true  -> o id tem respostas diferentes por unidade
 *                          (TRF2/JFRJ/JFES), entao o bot pergunta antes
 *                          de responder.
 * "needsUnidade": false -> resposta unica, nao ha submenu.
 * "special": "contato_unidade" -> tratado por um fluxo de busca proprio
 *                          (ver contactDirectory.js), nao por resposta fixa.
 * "special": "cadastro"  -> abre um SUBMENU com os itens cujo "parent" e
 *                          este id (ver getChildren / chatEngine.cadastroSubmenu).
 * "parent": "<id>"       -> o item NAO aparece no menu principal; so no
 *                          submenu do id indicado. Continua valendo para a IA
 *                          e para digitacao livre (ex.: "perito").
 */
const MENU_META = {
    consulta_processo: {
        label: "Consulta de processos públicos",
        keywords: ["consulta de processo", "consultar processo", "processo", "andamento processual", "processo público"],
        needsUnidade: true,
    },
    cadastro: {
        label: "Cadastro",
        keywords: ["cadastro", "cadastros", "cadastrar", "fazer cadastro", "fazer um cadastro"],
        needsUnidade: false,
        special: "cadastro",
    },
    cadastro_jus_postulandi: {
        label: "Cadastro de Jus Postulandi",
        keywords: ["cadastro eproc", "cadastro no eproc", "jus postulandi", "cadastro sem advogado"],
        needsUnidade: true,
        parent: "cadastro",
    },
    cadastro_perito: {
        label: "Cadastro de perito",
        keywords: ["cadastro de perito", "cadastro perito", "perito"],
        needsUnidade: true,
        parent: "cadastro",
    },
    cadastro_sociedade_advogados: {
        label: "Cadastro de sociedade de advogados",
        keywords: ["cadastro de sociedade de advogados", "sociedade de advogados", "cadastro sociedade"],
        needsUnidade: true,
        parent: "cadastro",
    },
    // emissao_custas: {
    //     label: "Emissao de custas / GRU",
    //     keywords: ["emissao de custas", "custas", "gru", "guia de recolhimento"],
    //     needsUnidade: false,
    // },
    // consulta_rpv: {
    //     label: "Consulta de RPV",
    //     keywords: ["consulta de rpv", "rpv", "requisicao de pequeno valor"],
    //     needsUnidade: true,
    // },
    contato_unidade: {
        label: "Contato / endereço de uma unidade (vara, foro etc.)",
        keywords: ["contato", "endereco", "telefone", "onde fica", "unidade", "vara", "foro", "endereco"],
        needsUnidade: false,
        special: "contato_unidade",
    },
};

const UNIDADE_LABELS = {
    TRF2: "TRF2 - Tribunal Regional Federal da 2ª Região",
    JFRJ: "JFRJ - Seção Judiciária do Rio de Janeiro",
    JFES: "JFES - Seção Judiciária do Espírito Santo",
};

/**
 * Canal oficial de abertura de chamado, oferecido quando o usuario diz que
 * o conteudo NAO ajudou (ver chatEngine, estado "awaiting_feedback_reason").
 * E o mesmo canal para todos os assuntos e unidades - se isso mudar por
 * assunto/unidade no futuro, transforme esta constante em um mapeamento e
 * ajuste chatEngine.centralContactMessage.
 */
const CHAMADO_INFO = {
    formulario: "http://chamados.trf2.jus.br/atendimentoprocessual",
    telefone: "(21) 2282-8854",
};

class KnowledgeBase {
    constructor() {
        this._raw = [];
        this._byId = new Map(); // id -> array of entries ({unidade, resposta, ...})
        this._contacts = []; // entries with id === contato_unidade
        this.load();
    }

    load() {
        const raw = fs.readFileSync(DATA_PATH, "utf-8");
        this._raw = JSON.parse(raw);

        this._byId.clear();
        this._contacts = [];

        for (const entry of this._raw) {
            if (entry.id === "contato_unidade") {
                this._contacts.push(entry);
                continue;
            }
            if (!this._byId.has(entry.id)) this._byId.set(entry.id, []);
            this._byId.get(entry.id).push(entry);
        }
    }

    /** Lista ordenada dos ids que aparecem no menu principal, com numero. */
    getMenuItems() {
        return Object.keys(MENU_META)
            .filter((id) => !MENU_META[id].parent) // itens de submenu nao aparecem no menu principal
            .map((id, index) => ({
                number: index + 1,
                id,
                label: MENU_META[id].label,
            }));
    }

    /** Itens do submenu de um id "pai" (ex.: "cadastro"), numerados e somente os que tem conteudo. */
    getChildren(parentId) {
        return Object.keys(MENU_META)
            .filter((id) => MENU_META[id].parent === parentId && this.hasContent(id))
            .map((id, index) => ({
                number: index + 1,
                id,
                label: MENU_META[id].label,
            }));
    }

    getMenuMeta(id) {
        return MENU_META[id] || null;
    }

    /** O id tem conteudo em conhecimento.json? (contato_unidade usa as entradas de contato) */
    hasContent(id) {
        if (id === "contato_unidade") return this._contacts.length > 0;
        if (MENU_META[id] && MENU_META[id].special === "cadastro") {
            return Object.keys(MENU_META).some((c) => MENU_META[c].parent === id && this.hasContent(c));
        }
        return (this._byId.get(id) || []).length > 0;
    }

    /**
     * Ids que o classificador de IA pode devolver (enum fechado): somente
     * assuntos do menu que EXISTEM no conhecimento.json. Assim a IA nunca
     * classifica para algo que a base de conhecimento nao sabe responder.
     */
    getKnownIds() {
        return Object.keys(MENU_META).filter((id) => this.hasContent(id));
    }

    /**
     * Tenta resolver o texto digitado diretamente contra o menu:
     * por numero ("2"), ou por rotulo/keyword digitados literalmente.
     * Retorna o id do menu ou null se nao bateu com nada.
     */
    matchMenuInput(text) {
        const clean = (text || "").trim().toLowerCase();
        if (!clean) return null;

        const items = this.getMenuItems();

        // Por numero
        const asNumber = Number(clean);
        if (Number.isInteger(asNumber)) {
            const found = items.find((it) => it.number === asNumber);
            if (found) return found.id;
        }

        // Por rotulo ou palavra-chave, exigindo IGUALDADE (nao "contido em").
        // Isso e proposital: frases mais longas e livres devem passar pela IA,
        // que as classifica contra a base de conhecimento - um match por
        // substring aqui seria impreciso (ex.: "processo" dentro de qualquer frase).
        // (inclui os itens de submenu, p.ex. "perito" vai direto para o cadastro de perito)
        for (const id of Object.keys(MENU_META)) {
            const meta = MENU_META[id];
            const candidates = [meta.label.toLowerCase(), ...meta.keywords.map((k) => k.toLowerCase())];
            if (candidates.includes(clean)) {
                return id;
            }
        }
        return null;
    }

    /**
     * Resolve a escolha do usuario dentro de um submenu (ex.: "cadastro"):
     * por numero, ou pelo rotulo/palavra-chave (ignorando acentos). Aceita
     * tambem frases que CONTENHAM a palavra-chave ("quero cadastro de perito"),
     * preferindo a palavra-chave mais longa. Retorna o id do filho ou null.
     */
    matchChildInput(parentId, text) {
        const strip = (v) =>
            (v || "")
                .toString()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim()
                .replace(/[.!?,;:]+$/, "")
                .trim();

        const clean = strip(text);
        if (!clean) return null;

        const children = this.getChildren(parentId);

        const asNumber = Number(clean);
        if (Number.isInteger(asNumber)) {
            const found = children.find((c) => c.number === asNumber);
            return found ? found.id : null;
        }

        const pairs = [];
        for (const child of children) {
            const meta = MENU_META[child.id];
            for (const cand of [meta.label, ...meta.keywords]) pairs.push({ id: child.id, cand: strip(cand) });
        }

        const exact = pairs.find((p) => p.cand === clean);
        if (exact) return exact.id;

        const contained = pairs.filter((p) => clean.includes(p.cand)).sort((a, b) => b.cand.length - a.cand.length);
        return contained.length ? contained[0].id : null;
    }

    /** As unidades disponiveis para um dado id (ex.: ['TRF2','JFRJ','JFES']). */
    getUnidadesFor(id) {
        const entries = this._byId.get(id) || [];
        return entries.map((e) => e.unidade).filter(Boolean);
    }

    getUnidadeLabel(code) {
        return UNIDADE_LABELS[code] || code;
    }

    /**
     * Retorna o texto de resposta EXATO do JSON para um id (+ unidade, se
     * aplicavel). Nunca reescreve, resume ou reformata o conteudo.
     */
    getResposta(id, unidade) {
        const entries = this._byId.get(id);
        if (!entries || entries.length === 0) return null;

        if (entries.length === 1 && !entries[0].unidade) {
            return entries[0].resposta;
        }
        const found = entries.find((e) => e.unidade === unidade);
        return found ? found.resposta : null;
    }

    /** Tenta casar a unidade digitada livremente (ex.: "rio", "es", "trf2"). */
    matchUnidadeInput(text, availableUnidades) {
        const clean = (text || "").trim().toLowerCase();
        const aliases = {
            TRF2: ["trf2", "trf 2", "tribunal", "segunda regiao", "2a regiao"],
            JFRJ: ["jfrj", "rio de janeiro", "rio", "rj"],
            JFES: ["jfes", "espirito santo", "es", "vitoria"],
        };
        for (const code of availableUnidades) {
            const list = [code.toLowerCase(), ...(aliases[code] || [])];
            if (list.some((a) => clean === a || clean.includes(a))) return code;
        }
        return null;
    }

    getContacts() {
        return this._contacts;
    }
}

module.exports = new KnowledgeBase();
module.exports.KnowledgeBase = KnowledgeBase;
module.exports.MENU_META = MENU_META;
module.exports.UNIDADE_LABELS = UNIDADE_LABELS;
module.exports.CHAMADO_INFO = CHAMADO_INFO;
