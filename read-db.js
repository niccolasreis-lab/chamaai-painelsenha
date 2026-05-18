const Database = require('better-sqlite3');
try {
  const db = new Database('C:\\ChamaAi\\database.sqlite');
  const rows = db.prepare("SELECT * FROM configuracoes").all();
  console.log('CONFIGS:', rows);
} catch (e) {
  console.error(e);
}
