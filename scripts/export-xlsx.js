/**
 * Converte data/conversations.csv em um .xlsx (Excel), para facilitar a
 * analise de desempenho do bot (filtros, tabela dinamica etc).
 *
 * Uso:
 *   npm install        (instala a dependencia opcional "xlsx")
 *   npm run export:xlsx
 *
 * Gera: data/conversations.xlsx
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'conversations.csv');
const XLSX_PATH = path.join(__dirname, '..', 'data', 'conversations.xlsx');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('Dependência "xlsx" não instalada. Rode: npm install xlsx');
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error('Nenhum log encontrado em', CSV_PATH, '- ainda não houve conversas.');
  process.exit(1);
}

const csv = fs.readFileSync(CSV_PATH, 'utf-8');
const workbook = XLSX.read(csv, { type: 'string' });
XLSX.writeFile(workbook, XLSX_PATH);

console.log('Exportado com sucesso para', XLSX_PATH);
