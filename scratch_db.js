const Database = require('better-sqlite3');
const db = new Database('C:\\ChamaAi\\database.sqlite');

console.log('--- CONFIGURAÇÕES ---');
const configs = db.prepare("SELECT * FROM configuracoes").all();
console.log(configs);

console.log('--- MEDIA_ITEMS ---');
const items = db.prepare("SELECT * FROM media_items").all();
console.log(items);

console.log('--- MEDIA_CAMPAIGNS ---');
const campaigns = db.prepare("SELECT * FROM media_campaigns").all();
console.log(campaigns);

db.close();
