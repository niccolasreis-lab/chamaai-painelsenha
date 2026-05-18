import Database from 'better-sqlite3';

const db = new Database('C:\\\\ChamaAi\\\\database.sqlite');
const r = db.prepare("SELECT * FROM configuracoes WHERE chave = 'portal_cliente_url'").get();
console.log('Result:', r);
