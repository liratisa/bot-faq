'use strict';

/**
 * Sessoes guardadas em memoria (Map). Para producao com multiplas
 * instancias do servidor, troque por Redis - a interface abaixo
 * (get/set/clear) e a unica coisa que precisaria mudar.
 */
const sessions = new Map();

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos de inatividade

function createSession(id) {
  const session = {
    id,
    // estados possiveis: 'menu' | 'awaiting_cadastro' | 'awaiting_unidade' | 'awaiting_contact_query'
    //                     | 'awaiting_contact_choice' | 'awaiting_satisfaction'
    //                     | 'awaiting_feedback_reason' | 'awaiting_more_help' | 'closed'
    state: 'menu',
    pendingId: null,       // id do assunto aguardando escolha de unidade
    forceAi: false,        // depois de um "nao entendi", forca IA na proxima mensagem
    contactResults: [],    // resultados de busca de unidade pendentes de escolha
    lastContent: null,     // { id, unidade } do ultimo conteudo entregue (p/ registrar a avaliacao)
    lastActivity: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  const s = sessions.get(id);
  if (!s) return createSession(id);
  s.lastActivity = Date.now();
  return s;
}

function resetToMenu(session) {
  session.state = 'menu';
  session.pendingId = null;
  session.forceAi = false;
  session.contactResults = [];
  session.lastContent = null;
}

// limpeza periodica de sessoes expiradas
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastActivity > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000).unref();

module.exports = { getSession, createSession, resetToMenu };
