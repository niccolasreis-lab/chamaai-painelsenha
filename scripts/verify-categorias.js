const Database = require('better-sqlite3');
const db = new Database('C:\\ChamaAi\\database.sqlite');

console.log('--- 1. Orfãos ---');
const orfaos = db.prepare(`
SELECT COUNT(*) as orfaos
FROM produtos
WHERE categoria_id IS NULL
   OR categoria_id IN (SELECT id FROM categorias WHERE ativo = 0);
`).get();
console.table([orfaos]);

console.log('--- 2. Distribuição por nova categoria ---');
const distrib = db.prepare(`
SELECT c.ordem, c.emoji, c.nome, COUNT(p.id) as total_produtos
FROM categorias c
LEFT JOIN produtos p ON p.categoria_id = c.id
WHERE c.ativo = 1
GROUP BY c.id
ORDER BY c.ordem;
`).all();
console.table(distrib);

console.log('--- 3. Categorias inativas ---');
const inativas = db.prepare(`
SELECT nome, COUNT(*) as produtos_migrados
FROM categorias
WHERE ativo = 0
GROUP BY id
ORDER BY nome;
`).all();
console.table(inativas);

db.close();
process.exit(0);
