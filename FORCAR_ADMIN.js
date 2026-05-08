const Database = require('better-sqlite3');
const path = require('path');

// Localiza o banco de dados na pasta AppData
const dbPath = path.join(process.env.APPDATA, 'chamaai-novo', 'database.sqlite');

console.log('--- RESET DE SENHA ADMINISTRADOR ---');
console.log('Buscando banco em:', dbPath);

try {
  const db = new Database(dbPath);

  // Garante que a tabela existe
  db.exec(`
    CREATE TABLE IF NOT EXISTS operadores (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nome       TEXT NOT NULL,
      login      TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil     TEXT NOT NULL,
      ativo      INTEGER NOT NULL DEFAULT 1,
      criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Tenta inserir ou atualizar o admin
  const check = db.prepare('SELECT id FROM operadores WHERE id = 1').get();

  if (check) {
    db.prepare("UPDATE operadores SET login = 'admin', senha_hash = 'admin', perfil = 'admin', ativo = 1 WHERE id = 1").run();
  } else {
    db.prepare("INSERT INTO operadores (id, nome, login, senha_hash, perfil, ativo) VALUES (1, 'Administrador', 'admin', 'admin', 'admin', 1)").run();
  }

  console.log('\n\x1b[32m%s\x1b[0m', '✅ USUARIO ADMIN CONFIGURADO!');
  console.log('LOGIN: admin');
  console.log('SENHA: admin');
  console.log('\nAgora voce pode abrir o sistema e fazer login.');
  
  db.close();
} catch (err) {
  console.error('\n\x1b[31m%s\x1b[0m', '❌ ERRO AO ACESSAR O BANCO:');
  console.error(err.message);
  console.log('\nCertifique-se de que o sistema esta FECHADO antes de rodar este script.');
}
