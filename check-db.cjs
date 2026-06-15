const Database = require('better-sqlite3');

try {
  const db = new Database('C:\\\\ChamaAi\\\\database.sqlite');
  console.log('Count:', db.prepare('SELECT COUNT(*) as count FROM supabase_sync_queue').get());
  console.log('Items:', db.prepare('SELECT * FROM supabase_sync_queue LIMIT 5').all());
  process.exit(0);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
