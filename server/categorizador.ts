/**
 * Categorizador Automático de Produtos Toledo
 *
 * Classifica os produtos com base em palavras-chave no nome/descrição,
 * seguindo as 10 categorias principais solicitadas.
 */

import * as fs from 'fs';
import * as path from 'path';

export const CATEGORIAS_DEFINIDAS = [
  'Queijos e Laticínios',
  'Embutidos, Frios e Carnes',
  'Peixes e Frutos do Mar',
  'Oleaginosas e Castanhas',
  'Frutas Secas e Desidratadas',
  'Farinhas, Amidos e Polvilhos',
  'Grãos, Cereais e Sementes',
  'Temperos, Especiarias e Conservas',
  'Suplementos, Chás e Produtos Naturais',
  'Outros e Utilidades'
] as const;

/**
 * Retorna a categoria ideal para um produto com base na sua descrição.
 */
export function getCategoryFromDescription(descricao: string): string {
  const desc = (descricao || '').toLowerCase();

  const match = (keywords: string[]) => keywords.some(k => desc.includes(k));

  // 1. Queijos e Laticínios
  if (match([
    'brie', 'gorgonzola', 'gouda', 'manteiga', 'requeijao', 'requeijão',
    'queijo', 'prato', 'mussarela', 'muçarela', 'mozarela', 'mozzarella', 'parmesao', 'parmesão',
    'provolone', 'ricota', 'coalho', 'cottage', 'cream cheese', 'iogurte',
    'margarina', 'nata', 'creme de leite', 'leite condensado', 'doce de leite',
    'mascarpone', 'camembert', 'laticinio', 'laticínio', 'laticinios', 'laticínios',
    'leite fermentado', 'yakult', 'chamyto', 'danone', 'chancliche'
  ])) {
    return 'Queijos e Laticínios';
  }

  // 2. Embutidos, Frios e Carnes
  if (match([
    'bacon', 'linguica', 'linguiça', 'presunto', 'charque',
    'salsicha', 'mortadela', 'salame', 'peito de peru', 'carne', 'frango',
    'bovino', 'suino', 'suíno', 'cordeiro', 'costela', 'picanha', 'maminha',
    'alcatra', 'contra file', 'contra-file', 'contrafilé', 'contrafile',
    'file mignon', 'filé mignon', 'filé', 'file', 'coxa', 'sobrecoxa', 'asa',
    'coracao', 'coração', 'copa', 'lombo', 'salame', 'pernil', 'paleta',
    'acem', 'acém', 'peito', 'lagarto', 'patinho', 'coxão', 'coxao', 'frios',
    'embutido', 'jerke', 'carne seca', 'carne-seca', 'salchicha', 'apresuntado',
    'calabresa', 'paio', 'chouriço', 'chourico', 'hambúrguer', 'hamburguer', 'burger'
  ])) {
    return 'Embutidos, Frios e Carnes';
  }

  // 3. Peixes e Frutos do Mar
  if (match([
    'bacalhau', 'salmao', 'salmão', 'peixe', 'atum', 'sardinha',
    'camarao', 'camarão', 'lula', 'polvo', 'lagosta', 'marisco',
    'mexilhao', 'mexilhão', 'tilapia', 'tilápia', 'merluza', 'pescada',
    'cação', 'cacao', 'tambaqui', 'pintado', 'truta', 'anchova', 'frutos do mar'
  ])) {
    return 'Peixes e Frutos do Mar';
  }

  // 4. Oleaginosas e Castanhas
  if (match([
    'amendoa', 'amêndoa', 'amendoas', 'amêndoas', 'castanha de caju', 'castanha-de-caju',
    'nozes', 'noz', 'pistache', 'amendoim', 'avela', 'avelã', 'macadamia', 'macadâmia',
    'peca', 'pecã', 'pinhao', 'pinhão', 'castanha do para', 'castanha-do-pará',
    'oleaginosa', 'oleaginosas', 'nuts', 'castanhas'
  ])) {
    return 'Oleaginosas e Castanhas';
  }

  // 5. Frutas Secas e Desidratadas
  if (match([
    'ameixa', 'tamara', 'tâmara', 'cranberry', 'coco ralado', 'damasco',
    'uva passa', 'uva-passa', 'passas', 'goji berry', 'gojiberry',
    'desidratada', 'desidratado', 'cristalizada', 'cristalizado', 'fruta seca',
    'frutas secas', 'fruta desidratada', 'frutas desidratadas'
  ])) {
    return 'Frutas Secas e Desidratadas';
  }

  // 6. Farinhas, Amidos e Polvilhos
  if (match([
    'farinha', 'amido', 'polvilho', 'maca peruana', 'fecula', 'fécula',
    'maizena', 'tapioca', 'farofa', 'goma de mandioca', 'creme de arroz'
  ])) {
    return 'Farinhas, Amidos e Polvilhos';
  }

  // 7. Grãos, Cereais e Sementes
  if (match([
    'quinoa', 'chia', 'lentilha', 'trigo', 'aveia', 'sucrilhos', 'grao', 'grão',
    'graos', 'grãos', 'cereal', 'cereais', 'semente', 'sementes', 'linhaca', 'linhaça',
    'girassol', 'gergelim', 'abobora', 'abóbora', 'arroz', 'feijao', 'feijão',
    'grao de bico', 'grão de bico', 'milho', 'ervilha', 'granola', 'musli', 'müsli',
    'flocos de milho', 'cevada', 'centeio', 'painço', 'painco'
  ])) {
    return 'Grãos, Cereais e Sementes';
  }

  // 8. Temperos, Especiarias e Conservas
  if (match([
    'alcaparra', 'azeitona', 'pimenta', 'pimentas', 'alho', 'caldos', 'caldo',
    'tempero', 'especiaria', 'especiarias', 'conserva', 'conservas', 'sal', 'sal grosso',
    'vinagre', 'azeite', 'oregano', 'orégano', 'manjericão', 'manjericao', 'alecrim',
    'tomilho', 'paprica', 'páprica', 'acafrao', 'açafrão', 'curry', 'cominho',
    'canela', 'cravo', 'louro', 'mostarda', 'ketchup', 'maionese', 'palmito',
    'pepino', 'champignon', 'cogumelo', 'chimichurri', 'colorau', 'noz-moscada',
    'noz moscada', 'salsa', 'cebolinha', 'coentro', 'hortela', 'hortelã'
  ])) {
    return 'Temperos, Especiarias e Conservas';
  }

  // 9. Suplementos, Chás e Produtos Naturais
  if (match([
    'whey', 'creatina', 'colageno', 'colágeno', 'spirulina', 'leite em po', 'leite em pó',
    'suplemento', 'suplementos', 'cha', 'chá', 'chas', 'chás', 'hibisco', 'camomila',
    'erva-doce', 'capim-cidreira', 'boldo', 'erva doce', 'capim cidreira', 'cha verde',
    'chá verde', 'proteina', 'proteína', 'bcaa', 'glutamina', 'albumina', 'mel',
    'propolis', 'própolis', 'geleia real', 'geléia real', 'produtos naturais',
    'produto natural', 'maca peruana'
  ])) {
    return 'Suplementos, Chás e Produtos Naturais';
  }

  // 10. Outros e Utilidades (Padrão)
  return 'Outros e Utilidades';
}

/**
 * Traduz um nome de categoria antigo para um nome novo.
 */
export function mapOldCategoryToNew(oldCat: string): string {
  const normalizedOld = (oldCat || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // Mapeia a string normalizada para a nova categoria correspondente
  const map: Record<string, string> = {
    'laticinios': 'Queijos e Laticínios',
    'frios': 'Embutidos, Frios e Carnes',
    'carnes': 'Embutidos, Frios e Carnes',
    'nuts e castanhas': 'Oleaginosas e Castanhas',
    'castanhas': 'Oleaginosas e Castanhas',
    'frutas secas': 'Frutas Secas e Desidratadas',
    'temperos e ervas': 'Temperos, Especiarias e Conservas',
    'cereais e graos': 'Grãos, Cereais e Sementes',
    'peixes e frutos do mar': 'Peixes e Frutos do Mar',
    'padaria': 'Outros e Utilidades',
    'hortifruti': 'Outros e Utilidades',
    'doces e chocolates': 'Outros e Utilidades',
    'outros': 'Outros e Utilidades',
  };

  // Se já for uma das 10 novas categorias (normalizada), retorna a versão correta com acento
  const exactNewMap: Record<string, string> = {
    'queijos e laticinios': 'Queijos e Laticínios',
    'embutidos, frios e carnes': 'Embutidos, Frios e Carnes',
    'peixes e frutos do mar': 'Peixes e Frutos do Mar',
    'oleaginosas e castanhas': 'Oleaginosas e Castanhas',
    'frutas secas e desidratadas': 'Frutas Secas e Desidratadas',
    'farinhas, amidos e polvilhos': 'Farinhas, Amidos e Polvilhos',
    'graos, cereais e sementes': 'Grãos, Cereais e Sementes',
    'temperos, especiarias e conservas': 'Temperos, Especiarias e Conservas',
    'suplementos, chas e produtos naturais': 'Suplementos, Chás e Produtos Naturais',
    'outros e utilidades': 'Outros e Utilidades',
  };

  if (exactNewMap[normalizedOld]) {
    return exactNewMap[normalizedOld];
  }

  return map[normalizedOld] || oldCat || 'Outros e Utilidades';
}

/**
 * Executa a migração das tabelas locais e arquivos de configuração para as 10 novas categorias.
 */
export function migrateDatabaseAndConfigs(db: any) {
  console.log('[MIGRAÇÃO CATEGORIAS] 🚀 Iniciando migração para as 10 novas categorias...');

  const PERSISTENT_DIR = 'C:\\ChamaAi';
  const PERSISTENT_CAT_PATH = path.join(PERSISTENT_DIR, 'categorias.json');
  const dbPath = path.join(PERSISTENT_DIR, 'database.sqlite');
  const dbBackupPath = dbPath + '.migration_backup';

  // 1. Checagem de Idempotência
  try {
    const migrado = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'categoria_migracao_v1'").get() as any;
    if (migrado && (migrado.value === '1' || migrado.valor === '1')) {
      console.log('[MIGRAÇÃO CATEGORIAS] ℹ️ Migração de categorias já executada anteriormente. Ignorando.');
      return;
    }
  } catch (err: any) {
    console.warn('[MIGRAÇÃO CATEGORIAS] ⚠️ Tabela configuracoes não estava disponível para checar idempotência:', err.message);
  }

  // 2. Backup do Banco de Dados SQLite (se não existir um backup prévio)
  try {
    if (fs.existsSync(dbPath)) {
      if (!fs.existsSync(dbBackupPath)) {
        fs.copyFileSync(dbPath, dbBackupPath);
        console.log(`[MIGRAÇÃO CATEGORIAS] 💾 Backup do banco criado com sucesso em: ${dbBackupPath}`);
      } else {
        console.log(`[MIGRAÇÃO CATEGORIAS] ℹ️ Backup do banco já existe em: ${dbBackupPath}. Não sobrescrevendo.`);
      }
    }
  } catch (e: any) {
    console.error('[MIGRAÇÃO CATEGORIAS] ❌ Falha crítica ao realizar backup do banco SQLite:', e.message);
    throw new Error(`Abortando migração: falha no backup do banco de dados. Detalhe: ${e.message}`);
  }

  // 3. Backup dos Arquivos de Configuração categorias.json
  const fallbackCatPaths = [
    path.join(__dirname, '../../server/categorias.json'),
    path.join(__dirname, 'categorias.json'),
    path.join(process.cwd(), 'server', 'categorias.json'),
  ];

  const backupCategoriasFile = (filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        const backupPath = filePath + '.migration_backup';
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(filePath, backupPath);
          console.log(`[MIGRAÇÃO CATEGORIAS] 💾 Backup do arquivo de categorias criado em: ${backupPath}`);
        } else {
          console.log(`[MIGRAÇÃO CATEGORIAS] ℹ️ Backup do arquivo de categorias já existe em: ${backupPath}. Não sobrescrevendo.`);
        }
      }
    } catch (e: any) {
      console.warn(`[MIGRAÇÃO CATEGORIAS] ⚠️ Falha ao criar backup para o arquivo de categorias: ${filePath}. Detalhe:`, e.message);
    }
  };

  backupCategoriasFile(PERSISTENT_CAT_PATH);
  for (const fallbackPath of fallbackCatPaths) {
    backupCategoriasFile(fallbackPath);
  }

  // Manter controle dos estados dos arquivos JSON para rollback
  const updatedFiles: { path: string; originalContent: string | null }[] = [];

  const rollbackJSONFiles = () => {
    console.log('[MIGRAÇÃO CATEGORIAS] 🔄 Revertendo alterações (Rollback de arquivos JSON)...');
    for (const file of updatedFiles) {
      try {
        const backupPath = file.path + '.migration_backup';
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, file.path);
          console.log(`[MIGRAÇÃO CATEGORIAS] 🔄 Restaurado arquivo JSON a partir do backup: ${file.path}`);
        } else if (file.originalContent === null) {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`[MIGRAÇÃO CATEGORIAS] 🔄 Removido arquivo recém-criado: ${file.path}`);
          }
        } else {
          fs.writeFileSync(file.path, file.originalContent, 'utf-8');
          console.log(`[MIGRAÇÃO CATEGORIAS] 🔄 Restaurado arquivo JSON original: ${file.path}`);
        }
      } catch (err: any) {
        console.error(`[MIGRAÇÃO CATEGORIAS] ❌ Falha crítica ao restaurar backup de ${file.path}:`, err.message);
      }
    }
  };

  // 4. Ler, Validar (Schema Check) e Atualizar arquivos JSON
  try {
    const processCategoriasFile = (filePath: string) => {
      if (!fs.existsSync(filePath)) return;

      const fileContent = fs.readFileSync(filePath, 'utf-8').trim();
      if (!fileContent) {
        throw new Error(`Arquivo de categorias vazio ou corrompido: ${filePath}`);
      }

      // Guardar conteúdo original para caso de rollback
      updatedFiles.push({
        path: filePath,
        originalContent: fileContent
      });

      let data: any;
      try {
        data = JSON.parse(fileContent);
      } catch (jsonErr: any) {
        throw new Error(`Arquivo ${filePath} contém JSON inválido: ${jsonErr.message}`);
      }

      if (typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`Estrutura de esquema inválida em ${filePath}. Esperado dicionário chave-valor.`);
      }

      let changed = false;

      for (const [plu, cat] of Object.entries(data)) {
        if (typeof cat !== 'string') {
          throw new Error(`Esquema inválido em ${filePath}: Categoria do PLU ${plu} deve ser uma string, recebido: ${typeof cat}`);
        }
        
        const catStr = cat || 'Outros e Utilidades';
        let newCat = mapOldCategoryToNew(catStr);

        // Validação estrita do schema das 10 novas categorias
        if (!CATEGORIAS_DEFINIDAS.includes(newCat as any)) {
          console.warn(`[MIGRAÇÃO CATEGORIAS] ⚠️ Categoria não reconhecida "${newCat}" para PLU ${plu}. Redirecionando para "Outros e Utilidades".`);
          newCat = 'Outros e Utilidades';
        }

        if (newCat !== catStr) {
          data[plu] = newCat;
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[MIGRAÇÃO CATEGORIAS] ✅ Arquivo validado e atualizado com sucesso: ${filePath}`);
      } else {
        console.log(`[MIGRAÇÃO CATEGORIAS] ℹ️ Arquivo já compatível com esquema: ${filePath}`);
      }
    };

    processCategoriasFile(PERSISTENT_CAT_PATH);
    for (const fallbackPath of fallbackCatPaths) {
      processCategoriasFile(fallbackPath);
    }
  } catch (jsonErr: any) {
    console.error('[MIGRAÇÃO CATEGORIAS] ❌ Erro de validação de esquema nos arquivos JSON. Abortando migração:', jsonErr.message);
    rollbackJSONFiles();
    throw jsonErr;
  }

  // 5. Atualizar tabela SQLite toledo_produtos dentro de transação e rodar Smoke Test
  try {
    const produtos = db.prepare('SELECT plu, descricao, categoria FROM toledo_produtos').all() as Array<{ plu: string; descricao: string; categoria: string }>;
    
    const stats: Record<string, number> = {};
    for (const cat of CATEGORIAS_DEFINIDAS) {
      stats[cat] = 0;
    }

    db.transaction((prods: typeof produtos) => {
      const updateStmt = db.prepare('UPDATE toledo_produtos SET categoria = ? WHERE plu = ?');
      for (const p of prods) {
        let novaCat = mapOldCategoryToNew(p.categoria);
        
        // Se mapeou para 'Outros e Utilidades' (ou antiga 'Outros'/'Hortifruti'/'Padaria'), tenta classificar por keywords
        if (novaCat === 'Outros e Utilidades' || !CATEGORIAS_DEFINIDAS.includes(novaCat as any)) {
          novaCat = getCategoryFromDescription(p.descricao);
        }

        // Incrementa estatística
        stats[novaCat] = (stats[novaCat] || 0) + 1;

        updateStmt.run(novaCat, p.plu);
      }

      // 6. Gravar flag de idempotência no banco dentro da mesma transação
      db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('categoria_migracao_v1', '1', datetime('now'))").run();

      // Smoke Test A: Validar no banco de dados SQLite dentro da transação
      const invalidProducts = db.prepare(`
        SELECT plu, descricao, categoria FROM toledo_produtos 
        WHERE categoria NOT IN (${CATEGORIAS_DEFINIDAS.map(() => '?').join(',')})
      `).all(...CATEGORIAS_DEFINIDAS) as any[];

      if (invalidProducts.length > 0) {
        throw new Error(`Smoke Test falhou: Encontrados ${invalidProducts.length} produtos com categorias inválidas pós-migração! PLU do primeiro: ${invalidProducts[0].plu} (${invalidProducts[0].categoria})`);
      }

      // Smoke Test C: Validar flag de idempotência dentro da transação
      const migrado = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'categoria_migracao_v1'").get() as any;
      const valor = migrado ? (migrado.valor || migrado.value) : null;
      if (valor !== '1') {
        throw new Error('Smoke Test falhou: Flag de migração categoria_migracao_v1 não está marcada como 1 no banco!');
      }
    })(produtos);

    console.log(`[MIGRAÇÃO CATEGORIAS] ✅ SQLite 'toledo_produtos' migrado com sucesso (${produtos.length} produtos).`);
    console.log('[MIGRAÇÃO CATEGORIAS] 📊 Distribuição de categorias pós-migração:', stats);

    // 7. Smoke Test pós-migração para arquivos JSON (já fora da transação, mas garantido e atômico)
    console.log('[MIGRAÇÃO CATEGORIAS] 🔍 Executando Smoke Test pós-migração para arquivos JSON...');

    // B. Validar arquivos JSON atualizados
    for (const filePath of [PERSISTENT_CAT_PATH, ...fallbackCatPaths]) {
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(fileContent);
        for (const [plu, cat] of Object.entries(data)) {
          if (!CATEGORIAS_DEFINIDAS.includes(cat as any)) {
            throw new Error(`Smoke Test falhou: Categoria inválida "${cat}" para PLU ${plu} no arquivo ${filePath}`);
          }
        }
      }
    }

    console.log('[MIGRAÇÃO CATEGORIAS] 🎉 Smoke Test concluído com sucesso! Todas as categorias e configurações estão válidas.');

  } catch (err: any) {
    console.error('[MIGRAÇÃO CATEGORIAS] ❌ Erro ao migrar/validar produtos. Iniciando rollback...', err.message);
    rollbackJSONFiles();
    throw err;
  }
}
