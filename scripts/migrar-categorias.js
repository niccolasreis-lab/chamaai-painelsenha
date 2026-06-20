const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = 'C:\\ChamaAi\\database.sqlite';
if (!fs.existsSync(dbPath)) {
  console.error(`[ERRO] Banco de dados não encontrado em ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

const categoriasNovas = [
  { nome: "Azeitonas e Conservas", emoji: "🫒", setor: "mercearia", ordem: 1 },
  { nome: "Grãos, Cereais e Farinhas", emoji: "🌾", setor: "mercearia", ordem: 2 },
  { nome: "Queijos", emoji: "🧀", setor: "frios", ordem: 3 },
  { nome: "Frios e Embutidos", emoji: "🥩", setor: "frios", ordem: 4 },
  { nome: "Castanhas e Oleaginosas", emoji: "🌰", setor: "granel", ordem: 5 },
  { nome: "Frutas Secas e Desidratadas", emoji: "🫐", setor: "granel", ordem: 6 },
  { nome: "Bacalhau e Peixes", emoji: "🐟", setor: "peixaria", ordem: 7 },
  { nome: "Temperos e Ervas", emoji: "🌿", setor: "mercearia", ordem: 8 },
  { nome: "Cereais e Granola", emoji: "🥣", setor: "mercearia", ordem: 9 },
  { nome: "Suplementos e Funcionais", emoji: "💊", setor: "saude", ordem: 10 },
  { nome: "Laticínios Granel", emoji: "🧈", setor: "laticinios", ordem: 11 },
  { nome: "Cárneos e Salgados", emoji: "🐷", setor: "acougue", ordem: 12 }
];

const mapeamentos = [
  { palavras: ["BACALHAU", "SALMAO", "PEIXE"], novaCategoria: "Bacalhau e Peixes" },
  { palavras: ["BRIE", "GORGONZOLA", "PARMESAO", "MUSSARELA", "PROVOLONE", "GOUDA", "COALHO", "ESTEPE", "EMENTAL", "MASDAMER", "GRUYERE", "SUICO", "RICOTA", "MINAS", "PECORINO", "CABLANCA", "PRIMA DONA", "KROON", "VINCENT", "CHEDAR", "PRATO LANCHE", "QUEIJO"], novaCategoria: "Queijos" },
  { palavras: ["AZEITONA", "ALCAPARRA", "ALCAPARRON", "CONSERVA MIX"], novaCategoria: "Azeitonas e Conservas" },
  { palavras: ["LINGUICA", "SALAME", "PRESUNTO", "BACON", "MORTADELA", "SALSICHA", "PAIO", "ROSBIFE", "APRESUNTADO", "PEITO DE PERU"], novaCategoria: "Frios e Embutidos" },
  { palavras: ["CASTANHA", "AMENDOIM", "AMENDOA", "NOZES", "AVELA", "PISTACHE", "PINHOLES", "MACADAMIA", "SEMENTE ABOBORA", "GIRASSOL SEMENTE", "CASTANHA DE BARU"], novaCategoria: "Castanhas e Oleaginosas" },
  { palavras: ["UVA PASSA", "AMEIXA", "TAMARA", "DAMASCO", "FIGO TURCO", "BANANA PASSA", "FRUTA CRISTALIZADA", "FRUTA GLACEADA", "FRUTA DESIDRATADA", "FRUTA SECA", "CEREJA MARRASQUINO", "TOMATE SECO"], novaCategoria: "Frutas Secas e Desidratadas" },
  { palavras: ["TEMPERO", "PIMENTA", "CANELA", "LOURO", "OREGANO", "TOMILHO", "ACAFRAO", "CURCUMA", "CARDAMOMO", "CAMOMILA", "HORTELA", "CHA VERDE", "HIBISCO", "CIDREIRA", "ERVA DOCE", "FUNCHO", "MOSTARDA GRAO", "ALHO DESIDRATADO", "ALHO FRITO", "CEBOLA GRANEL", "COLORAU", "CALDO GRANEL", "FUMACA PO", "GENGIBRE MOIDO", "ERVAS FINAS", "ALECRIM", "CEBOLINHA GRANEL"], novaCategoria: "Temperos e Ervas" },
  { palavras: ["SUCRILHOS", "AVEIA", "GRANOLA", "AMARANTO FLOCOS", "BISCOITO DE ARROZ", "FRISPY", "MICRO RICE"], novaCategoria: "Cereais e Granola" },
  { palavras: ["WHEY", "PROTEINA", "CREATINA", "COLAGENO", "GLUTAMINA", "ALBUMINA", "SPIRULINA", "PSYLLIUM", "PISILIUM", "LEVEDURA", "POLEN", "TRIBULUS", "GUARANA", "MARAPUAMA", "CATUABA", "GINSENG", "MORINGA", "ORA PRO NOBIS", "CHIA", "LINHACA", "GERGELIM", "CACAU", "ERITRITOL", "XILITOL", "ACUCAR DE COCO", "AGAR AGAR", "GELATINA NEUTRA", "GOMA XANTANA", "FIBRA", "BIOMASSA"], novaCategoria: "Suplementos e Funcionais" },
  { palavras: ["MANTEIGA", "REQUEIJAO", "DOCE DE LEITE", "DOCE PE DE MOCA", "DOCE PREDILETA", "LEITE DE COCO PO", "LEITE PO"], novaCategoria: "Laticínios Granel" },
  { palavras: ["SALMORADO", "CHARQUE", "JOELHO", "COSTELA DICALANI", "PALETA DICALANI", "LOMBO DICALANI", "PERNIL", "FRANGO CONGELADO", "PERTENCES"], novaCategoria: "Cárneos e Salgados" },
  { palavras: ["QUINOA", "ARROZ GRANEL", "LENTILHA", "GRAO DE BICO", "FEIJAO", "TRIGO", "FARINHA", "POLVILHO", "TAPIOCA", "MILHO PIPOCA", "CANJICA", "SAGU", "AMIDO", "CEVADA", "PAINCO", "COUSCOUS", "ERVILHA PARTIDA", "SOJA GRAO"], novaCategoria: "Grãos, Cereais e Farinhas" },
];

function determineCategory(nomeProduto) {
  const nomeUpper = nomeProduto.toUpperCase();
  for (const map of mapeamentos) {
    for (const palavra of map.palavras) {
      if (nomeUpper.includes(palavra)) {
        return map.novaCategoria;
      }
    }
  }
  return "Grãos, Cereais e Farinhas"; // fallback
}

function normalizeSlug(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

console.log('[MIGRAÇÃO] Iniciando script de migração...');

const dateStr = new Date().toISOString().replace(/[:\.\-]/g, '').slice(0, 15);
const backupPath = path.join('C:\\ChamaAi', `database_backup_${dateStr}.sqlite`);
db.exec(`VACUUM INTO '${backupPath}'`);
console.log(`[MIGRAÇÃO] Backup criado em: ${backupPath}`);

let estatisticas = {};
let fallbackCount = 0;
categoriasNovas.forEach(c => estatisticas[c.nome] = 0);

try {
  db.transaction(() => {
    // 1. Inserir novas categorias
    let insertedCategories = 0;
    const insertCat = db.prepare(`
      INSERT OR IGNORE INTO categorias (nome, emoji, setor, ordem, ativo, slug, created_at, updated_at) 
      VALUES (?, ?, ?, ?, 1, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);
    
    for (const cat of categoriasNovas) {
      const slug = normalizeSlug(cat.nome);
      const res = insertCat.run(cat.nome, cat.emoji, cat.setor, cat.ordem, slug);
      if (res.changes > 0) insertedCategories++;
    }
    console.log(`[MIGRAÇÃO] Novas categorias criadas: ${insertedCategories}`);

    // Pegar mapeamento do ID das novas categorias
    const catIdMap = {};
    const categoriasFromDb = db.prepare("SELECT id, nome FROM categorias").all();
    categoriasFromDb.forEach(c => {
      catIdMap[c.nome] = c.id;
    });

    // 2. Migrar mapeamentos de produtos
    const produtos = db.prepare("SELECT id, nome FROM produtos").all();
    const updateProd = db.prepare("UPDATE produtos SET categoria_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?");

    let produtosMigrados = 0;
    for (const prod of produtos) {
      const novaCatNome = determineCategory(prod.nome);
      if (novaCatNome === "Grãos, Cereais e Farinhas") {
        fallbackCount++;
      }
      const novaCatId = catIdMap[novaCatNome];
      if (novaCatId) {
        updateProd.run(novaCatId, prod.id);
        produtosMigrados++;
        estatisticas[novaCatNome]++;
      } else {
        console.warn(`[MIGRAÇÃO] AVISO: Categoria ${novaCatNome} não encontrada no banco!`);
      }
    }

    console.log(`[MIGRAÇÃO] PLUs totais migrados: ${produtosMigrados}`);
    console.log(`[MIGRAÇÃO] PLUs em fallback: ${fallbackCount}`);
    
    // 3. Desativar categorias antigas
    const desativarAntigas = db.prepare(`
      UPDATE categorias SET ativo = 0, updated_at = datetime('now', 'localtime') 
      WHERE nome NOT IN (
        'Azeitonas e Conservas',
        'Grãos, Cereais e Farinhas',
        'Queijos',
        'Frios e Embutidos',
        'Castanhas e Oleaginosas',
        'Frutas Secas e Desidratadas',
        'Bacalhau e Peixes',
        'Temperos e Ervas',
        'Cereais e Granola',
        'Suplementos e Funcionais',
        'Laticínios Granel',
        'Cárneos e Salgados'
      )
    `);
    const desativadas = desativarAntigas.run();
    console.log(`[MIGRAÇÃO] Categorias antigas desativadas: ${desativadas.changes}`);

    // Log de auditoria final
    db.prepare(`
      INSERT INTO configuracoes (chave, valor, atualizado_em) 
      VALUES ('MIGRACAO_CATEGORIAS_12_SETOR', '1', datetime('now', 'localtime'))
      ON CONFLICT(chave) DO UPDATE SET valor = '1', atualizado_em = datetime('now', 'localtime')
    `).run();

  })();

  console.log(`[MIGRAÇÃO] Transação concluída com sucesso.`);
  console.log('[MIGRAÇÃO] Detalhamento por categoria:');
  for (const [cat, count] of Object.entries(estatisticas)) {
    console.log(`  - ${cat}: ${count} PLUs`);
  }

  // Verificação
  const orfaos = db.prepare(`
    SELECT COUNT(*) as count FROM produtos 
    WHERE categoria_id IS NULL OR categoria_id IN (SELECT id FROM categorias WHERE ativo = 0)
  `).get();
  console.log(`[MIGRAÇÃO] Resultado da verificação (Orfãos = 0 esperado): ${orfaos.count}`);

} catch (err) {
  console.error('[MIGRAÇÃO] Erro fatal, realizando rollback...', err);
  process.exit(1);
}

db.close();
