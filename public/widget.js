/**
 * Widget de FAQ - Justiça Federal da 2ª Região
 * -----------------------------------------------
 * Incorpore no site com:
 *   <script src="https://SEU_DOMINIO/widget/widget.js" data-api-base="https://SEU_DOMINIO"></script>
 *
 * O script roda dentro de uma Shadow DOM para não conflitar com o
 * CSS do site host, e não altera nada na página além de inserir um
 * unico elemento fixo no canto inferior direito.
 */
(function () {
    "use strict";

    var CURRENT_SCRIPT = document.currentScript;
    var API_BASE = (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute("data-api-base")) || "";
    var STORAGE_KEY = "jf2_faq_bot_session_id";

    // ---------- estado ----------
    var state = {
        open: false,
        sessionId: null,
        sending: false,
    };

    // ---------- host + shadow root ----------
    var host = document.createElement("div");
    host.id = "jf2-faq-bot-host";
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent =
        "" +
        ":host{all:initial}" +
        '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}' +
        ".jf2-root{position:fixed;bottom:22px;right:22px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:10px}" +
        ".jf2-balloon{background:#0F2A4A;color:#fff;padding:10px 14px;border-radius:10px;font-size:14px;font-weight:500;box-shadow:0 6px 20px rgba(15,42,74,.25);cursor:pointer;opacity:0;transform:translateY(6px);transition:opacity .35s ease,transform .35s ease;position:relative;max-width:200px}" +
        ".jf2-balloon.show{opacity:1;transform:translateY(0)}" +
        '.jf2-balloon:after{content:"";position:absolute;bottom:-6px;right:22px;width:12px;height:12px;background:#0F2A4A;transform:rotate(45deg)}' +
        ".jf2-balloon-close{position:absolute;top:-7px;right:-7px;background:#fff;color:#0F2A4A;border-radius:50%;width:18px;height:18px;font-size:12px;line-height:18px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.2);cursor:pointer;font-weight:700}" +
        ".jf2-fab{width:60px;height:60px;border-radius:50%;background:#0F2A4A;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(15,42,74,.35);transition:transform .18s ease}" +
        ".jf2-fab:hover{transform:scale(1.06)}" +
        ".jf2-fab svg{width:28px;height:28px}" +
        ".jf2-dot{position:absolute;top:-2px;right:-2px;width:14px;height:14px;background:#C89B3C;border-radius:50%;border:2px solid #fff}" +
        ".jf2-panel{width:360px;max-width:calc(100vw - 44px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(15,42,74,.28);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;transition:opacity .22s ease,transform .22s ease}" +
        ".jf2-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}" +
        ".jf2-header{background:#0F2A4A;color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between}" +
        ".jf2-header-title{font-size:15px;font-weight:600;line-height:1.3}" +
        ".jf2-header-sub{font-size:12px;color:#B9C6D6;margin-top:2px}" +
        ".jf2-header-close{background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1;opacity:.85;padding:4px}" +
        ".jf2-header-close:hover{opacity:1}" +
        ".jf2-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#F4F6F9}" +
        ".jf2-msg{max-width:90%;padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}" +
        ".jf2-msg.bot{align-self:flex-start;background:#fff;color:#1B2733;border:1px solid #E3E8EF;border-bottom-left-radius:3px}" +
        ".jf2-msg.user{align-self:flex-end;background:#0F2A4A;color:#fff;border-bottom-right-radius:3px}" +
        ".jf2-msg a{color:inherit;text-decoration:underline}" +
        ".jf2-msg strong{font-weight:700}" +
        ".jf2-msg em{font-style:italic}" +
        ".jf2-msg .jf2-chat-image{display:block;max-width:100%;height:auto;margin:10px 0;border-radius:8px}" +
        ".jf2-choices{align-self:flex-start;display:flex;flex-wrap:wrap;gap:8px}" +
        ".jf2-choice{background:#fff;color:#0F2A4A;border:1.5px solid #0F2A4A;border-radius:18px;padding:7px 18px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s ease,color .15s ease}" +
        ".jf2-choice:hover{background:#0F2A4A;color:#fff}" +
        ".jf2-choice:focus-visible{background:#0F2A4A;color:#fff;outline:none}" +
        ".jf2-typing{align-self:flex-start;background:#fff;border:1px solid #E3E8EF;border-radius:12px;border-bottom-left-radius:3px;padding:10px 14px;display:flex;gap:4px}" +
        ".jf2-typing span{width:6px;height:6px;border-radius:50%;background:#9AA7B6;display:inline-block;animation:jf2-blink 1.2s infinite ease-in-out}" +
        ".jf2-typing span:nth-child(2){animation-delay:.15s}" +
        ".jf2-typing span:nth-child(3){animation-delay:.3s}" +
        "@keyframes jf2-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}" +
        ".jf2-footer{padding:12px;border-top:1px solid #E3E8EF;display:flex;gap:8px;background:#fff}" +
        ".jf2-input{flex:1;border:1px solid #D7DEE7;border-radius:10px;padding:10px 12px;font-size:13.5px;resize:none;outline:none;max-height:80px}" +
        ".jf2-input:focus{border-color:#0F2A4A}" +
        ".jf2-send{background:#0F2A4A;border:none;color:#fff;border-radius:10px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}" +
        ".jf2-send:disabled{opacity:.5;cursor:default}" +
        ".jf2-send svg{width:18px;height:18px}" +
        ".jf2-footnote{font-size:10.5px;color:#8B97A6;text-align:center;padding:6px 10px 10px;background:#fff}" +
        "@media (max-width:420px){.jf2-panel{width:calc(100vw - 24px);right:0}}";
    root.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "jf2-root";
    wrap.innerHTML =
        '<div class="jf2-balloon" id="jf2-balloon">' +
        '<span class="jf2-balloon-close" id="jf2-balloon-close">&times;</span>' +
        "Dúvidas? Fale com o assistente virtual" +
        "</div>" +
        '<div class="jf2-panel" id="jf2-panel">' +
        '<div class="jf2-header">' +
        "<div>" +
        '<div class="jf2-header-title">Assistente Virtual</div>' +
        '<div class="jf2-header-sub">Justiça Federal da 2ª Região</div>' +
        "</div>" +
        '<button class="jf2-header-close" id="jf2-close" aria-label="Fechar">&times;</button>' +
        "</div>" +
        '<div class="jf2-body" id="jf2-body"></div>' +
        '<div class="jf2-footer">' +
        '<textarea class="jf2-input" id="jf2-input" rows="1" placeholder="Digite sua dúvida..."></textarea>' +
        '<button class="jf2-send" id="jf2-send" aria-label="Enviar">' +
        '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12L20 4L13 20L11 13L4 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
        "</button>" +
        "</div>" +
        // '<div class="jf2-footnote">Em caso de dúvida jurídica, procure orientação de um advogado ou da Defensoria.</div>' +
        "</div>" +
        '<button class="jf2-fab" id="jf2-fab" aria-label="Abrir assistente virtual">' +
        '<svg viewBox="0 0 24 24" fill="none"><path d="M4 4H20V16H8L4 20V4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
        '<span class="jf2-dot" id="jf2-dot"></span>' +
        "</button>";
    root.appendChild(wrap);

    var els = {
        balloon: root.getElementById("jf2-balloon"),
        balloonClose: root.getElementById("jf2-balloon-close"),
        panel: root.getElementById("jf2-panel"),
        body: root.getElementById("jf2-body"),
        close: root.getElementById("jf2-close"),
        input: root.getElementById("jf2-input"),
        send: root.getElementById("jf2-send"),
        fab: root.getElementById("jf2-fab"),
        dot: root.getElementById("jf2-dot"),
    };

    // balão aparece depois de um tempinho, uma vez por visita
    setTimeout(function () {
        if (!state.open) els.balloon.classList.add("show");
    }, 2500);

    els.balloonClose.addEventListener("click", function (e) {
        e.stopPropagation();
        els.balloon.classList.remove("show");
    });
    els.balloon.addEventListener("click", openPanel);
    els.fab.addEventListener("click", function () {
        state.open ? closePanel() : openPanel();
    });
    els.close.addEventListener("click", closePanel);

    els.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendCurrentInput();
        }
    });
    els.input.addEventListener("input", function () {
        els.input.style.height = "auto";
        els.input.style.height = Math.min(els.input.scrollHeight, 80) + "px";
    });
    els.send.addEventListener("click", sendCurrentInput);

    function openPanel() {
        state.open = true;
        els.panel.classList.add("open");
        els.balloon.classList.remove("show");
        els.dot.style.display = "none";
        if (!state.sessionId) start();
    }
    function closePanel() {
        state.open = false;
        els.panel.classList.remove("open");
    }

    function addMessage(text, sender) {
        var div = document.createElement("div");
        div.className = "jf2-msg " + sender;
        div.innerHTML = formatMessage(text);
        els.body.appendChild(div);
        els.body.scrollTop = els.body.scrollHeight;
    }

    /** Botoes de resposta rapida (ex.: Sim / Nao). O clique envia o "value". */
    function addChoices(buttons) {
        var row = document.createElement("div");
        row.className = "jf2-choices";
        buttons.forEach(function (b) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "jf2-choice";
            btn.textContent = b.text;
            btn.addEventListener("click", function () {
                sendMessage(b.value != null ? b.value : b.text, b.text);
            });
            row.appendChild(btn);
        });
        els.body.appendChild(row);
        els.body.scrollTop = els.body.scrollHeight;
    }
    function clearChoices() {
        Array.prototype.slice.call(els.body.querySelectorAll(".jf2-choices")).forEach(function (row) {
            row.remove();
        });
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function linkify(str) {
        return str.replace(/(https?:\/\/[^\s]+)/g, function (url) {
            var clean = url.replace(/[.,;)]+$/, "");
            return '<a href="' + clean + '" target="_blank" rel="noopener noreferrer">' + clean + "</a>";
        });
    }

    // Formatação simples nas respostas da base: **negrito**, *itálico*,
    // listas com marcadores e imagens no formato Markdown.
    function formatMessage(text) {
        var result = escapeHtml(text);

        // Imagens: ![descrição](/imagens/exemplo.png)
        result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, src) {
            return '<img src="' + src + '" alt="' + alt + '" class="jf2-chat-image">';
        });

        result = linkify(result);

        // Negrito: **texto**
        result = result.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

        // Itálico: *texto*
        result = result.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

        return result;
    }

    function showTyping() {
        var div = document.createElement("div");
        div.className = "jf2-typing";
        div.id = "jf2-typing-indicator";
        div.innerHTML = "<span></span><span></span><span></span>";
        els.body.appendChild(div);
        els.body.scrollTop = els.body.scrollHeight;
    }
    function hideTyping() {
        var el = root.getElementById("jf2-typing-indicator");
        if (el) el.remove();
    }

    /** Mostra mensagens do bot em sequencia, com indicador de "digitando". */
    function playBotMessages(messages) {
        return messages.reduce(function (chain, msg) {
            return chain.then(function () {
                showTyping();
                var delay = 500 + Math.min(msg.text.length * 6, 900);
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        hideTyping();
                        addMessage(msg.text, "bot");
                        if (msg.buttons && msg.buttons.length) addChoices(msg.buttons);
                        resolve();
                    }, delay);
                });
            });
        }, Promise.resolve());
    }

    function setSending(v) {
        state.sending = v;
        els.send.disabled = v;
    }

    function start() {
        setSending(true);
        fetch(API_BASE + "/api/start", { method: "POST" })
            .then(function (r) {
                return r.json();
            })
            .then(function (data) {
                state.sessionId = data.sessionId;
                sessionStorage.setItem(STORAGE_KEY, data.sessionId);
                return playBotMessages(data.messages);
            })
            .catch(function () {
                addMessage("Não consegui me conectar agora. Tente novamente em instantes.", "bot");
            })
            .finally(function () {
                setSending(false);
            });
    }

    function sendCurrentInput() {
        var text = els.input.value.trim();
        if (!text || state.sending) return;
        els.input.value = "";
        els.input.style.height = "auto";
        sendMessage(text, text);
    }

    /**
     * Envia uma mensagem ao backend. "value" e o que o backend recebe;
     * "label" e o que aparece no balao do usuario (ex.: clique no botao
     * "Sim" -> mostra "Sim" e envia "sim").
     */
    function sendMessage(value, label) {
        if (state.sending) return;
        clearChoices(); // responder (digitando ou clicando) encerra os botoes pendentes
        addMessage(label, "user");
        setSending(true);

        fetch(API_BASE + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: state.sessionId, message: value }),
        })
            .then(function (r) {
                return r.json();
            })
            .then(function (data) {
                return playBotMessages(data.messages || []);
            })
            .catch(function () {
                addMessage("Não consegui enviar sua mensagem agora. Tente novamente em instantes.", "bot");
            })
            .finally(function () {
                setSending(false);
            });
    }
})();
