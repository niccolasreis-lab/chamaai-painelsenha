import Database from 'better-sqlite3';

try {
  const db = new Database('C:\\\\ChamaAi\\\\database.sqlite');
  
  console.log('=== SUPABASE SYNC QUEUE DIAGNÓSTICO ===');
  console.log('');
  
  // 1. Contagem total
  const total = db.prepare('SELECT COUNT(*) as count FROM supabase_sync_queue').get() as any;
  console.log(`📊 Total de itens na fila: ${total?.count || 0}`);
  
  // 2. Por tabela
  console.log('');
  console.log('📋 Por tabela:');
  const byTable = db.prepare(
    'SELECT tabela, COUNT(*) as count FROM supabase_sync_queue GROUP BY tabela ORDER BY count DESC'
  ).all() as any[];
  byTable.forEach((row: any) => console.log(`   ${row.tabela}: ${row.count}`));
  
  // 3. Por ação
  console.log('');
  console.log('🔧 Por ação:');
  const byAction = db.prepare(
    'SELECT acao, COUNT(*) as count FROM supabase_sync_queue GROUP BY acao ORDER BY count DESC'
  ).all() as any[];
  byAction.forEach((row: any) => console.log(`   ${row.acao}: ${row.count}`));
  
  // 4. Status de tentativas
  console.log('');
  console.log('🔄 Status de tentativas:');
  const attempts = db.prepare(
    'SELECT tentativas, COUNT(*) as count FROM supabase_sync_queue GROUP BY tentativas ORDER BY tentativas ASC'
  ).all() as any[];
  attempts.forEach((row: any) => console.log(`   ${row.tentativas} tentativas: ${row.count} itens`));
  
  // 5. Itens que falharam (excederam max_tentativas)
  const failed = db.prepare(
    'SELECT COUNT(*) as count FROM supabase_sync_queue WHERE tentativas >= max_tentativas'
  ).get() as any;
  console.log('');
  console.log(`❌ Itens que falharam (excederam max tentativas): ${failed?.count || 0}`);
  
  // 6. Itens pendentes com retry
  const retry = db.prepare(
    'SELECT COUNT(*) as count FROM supabase_sync_queue WHERE tentativas > 0 AND tentativas < max_tentativas'
  ).get() as any;
  console.log(`⏳ Itens com retry pendente: ${retry?.count || 0}`);
  
  // 7. Idade do item mais antigo
  const oldest = db.prepare(
    'SELECT id, tabela, acao, tentativas, criado_em FROM supabase_sync_queue ORDER BY id ASC LIMIT 1'
  ).get() as any;
  if (oldest) {
    console.log('');
    console.log('📅 Item mais antigo:');
    console.log(`   ID: ${oldest.id}, Tabela: ${oldest.tabela}, Ação: ${oldest.acao}`);
    console.log(`   Tentativas: ${oldest.tentativas}, Criado em: ${oldest.criado_em}`);
  }
  
  // 8. Últimos 5 itens
  const recent = db.prepare(
    'SELECT * FROM supabase_sync_queue ORDER BY id DESC LIMIT 5'
  ).all() as any[];
  if (recent.length > 0) {
    console.log('');
    console.log('🕐 Últimos 5 itens:');
    recent.forEach((item: any) => {
      console.log(`   [${item.id}] ${item.tabela}/${item.acao} - tentativas: ${item.tentativas} (${item.criado_em})`);
    });
  }
  
  // 9. Verificar outras tabelas importantes
  console.log('');
  console.log('=== OUTRAS TABELAS ===');
  
  const tables = ['senhas', 'operadores', 'balcoes', 'configuracoes', 'toledo_produtos', 'teloes', 'midia_indoor_items', 'midia_indoor_campanhas'];
  
  for (const table of tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as any;
      console.log(`   ${table}: ${count?.count || 0} registros`);
    } catch (e: any) {
      console.log(`   ${table}: ⚠️ Erro - ${e.message}`);
    }
  }
  
  console.log('');
  console.log('=== DIAGNÓSTICO CONCLUÍDO ===');
  
  process.exit(0);
} catch (e: any) {
  console.error('❌ Erro ao acessar banco de dados:', e.message);
  process.exit(1);
}
