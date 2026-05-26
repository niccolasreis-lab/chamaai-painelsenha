const Database = require('better-sqlite3');
try {
  const db = new Database('C:\\ChamaAi\\database.sqlite');
  
  console.log('--- Configurações de Migração ---');
  const migrationFlag = db.prepare("SELECT * FROM configuracoes WHERE chave = ?").get('categoria_migracao_v1');
  console.log(migrationFlag);

  console.log('\n--- Contagem por Categoria no Banco (toledo_produtos) ---');
  const rows = db.prepare(`
    SELECT categoria, COUNT(*) as total 
    FROM toledo_produtos 
    GROUP BY categoria 
    ORDER BY total DESC
  `).all();
  console.log(rows);
} catch (e) {
  console.error(e);
}
