const Database = require('better-sqlite3');
try {
  const db = new Database('C:\\ChamaAi\\database.sqlite');
  console.log('--- SYNC QUEUE COUNT ---');
  const count = db.prepare("SELECT COUNT(*) as cnt FROM supabase_sync_queue").get();
  console.log('Sync queue count:', count.cnt);

  console.log('--- PENDING SYNC ITEMS ---');
  const pending = db.prepare("SELECT * FROM supabase_sync_queue LIMIT 5").all();
  console.log(JSON.stringify(pending, null, 2));

  console.log('--- RECENT LOCAL SENHAS ---');
  const senhas = db.prepare("SELECT * FROM senhas ORDER BY id DESC LIMIT 5").all();
  console.log(JSON.stringify(senhas, null, 2));

  console.log('--- SUPABASE CONFIGS IN DB ---');
  const configs = db.prepare("SELECT * FROM configuracoes WHERE chave LIKE '%supabase%' OR chave LIKE '%nome%'").all();
  console.log(JSON.stringify(configs, null, 2));

  db.close();
} catch (e) {
  console.error('ERROR:', e);
}
process.exit(0);
