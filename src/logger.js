'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'data', 'conversations.csv');

const HEADER = [
  'timestamp',
  'session_id',
  'sender',
  'message',
  'matched_id',
  'unidade',
  'tipo',
  'match_method',
  'confidence',
].join(',') + '\n';

function ensureFile() {
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, HEADER, 'utf-8');
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Registra uma linha de conversa.
 * sender: 'user' | 'bot'
 * matchMethod: 'menu' | 'ai' | 'fallback' | 'system' | null
 */
function logMessage({
  sessionId,
  sender,
  message,
  matchedId = null,
  unidade = null,
  tipo = null,
  matchMethod = null,
  confidence = null,
}) {
  ensureFile();
  const row = [
    new Date().toISOString(),
    sessionId,
    sender,
    (message || '').replace(/\r?\n/g, ' \\n '),
    matchedId,
    unidade,
    tipo,
    matchMethod,
    confidence,
  ]
    .map(csvEscape)
    .join(',') + '\n';

  fs.appendFileSync(LOG_PATH, row, 'utf-8');
}

module.exports = { logMessage, LOG_PATH };
