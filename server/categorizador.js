"use strict";
/**
 * Categorizador Automático de Produtos Toledo
 *
 * Classifica os produtos com base em palavras-chave no nome/descrição,
 * seguindo as 9 novas categorias oficiais.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORIAS_DEFINIDAS = void 0;
exports.getCategoryFromDescription = getCategoryFromDescription;
exports.mapOldCategoryToNew = mapOldCategoryToNew;
exports.migrateDatabaseAndConfigs = migrateDatabaseAndConfigs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.CATEGORIAS_DEFINIDAS = [
    'Mesa de Frios, Queijos e Antepastos',
    'Ingredientes para Feijoada e Churrasco',
    'Pescados e Empório Tradicional Ibérico',
    'Hora do Lanche e Snacks',
    'Confeitaria e Sobremesas',
    'Mundo Fitness e Suplementação',
    'Empório Natural, Grãos e Farinhas Naturais',
    'Cantinho Árabe, Especiarias e Ervas',
    'Despensa e Utilidades Básicas'
];
/**
 * Retorna a categoria ideal para um produto com base na sua descrição.
 */
function getCategoryFromDescription(descricao) {
    const desc = (descricao || '').toLowerCase();
    const match = (keywords) => keywords.some(k => desc.includes(k));
    // 1. Mesa de Frios, Queijos e Antepastos
    if (match([
        'brie', 'gorgonzola', 'gouda', 'manteiga', 'requeijao', 'requeijão',
        'queijo', 'prato', 'mussarela', 'muçarela', 'mozarela', 'mozzarella', 'parmesao', 'parmesão',
        'provolone', 'ricota', 'coalho', 'cottage', 'cream cheese', 'iogurte',
        'margarina', 'nata', 'creme de leite', 'leite condensado', 'doce de leite',
        'mascarpone', 'camembert', 'laticinio', 'laticínio', 'laticinios', 'laticínios',
        'leite fermentado', 'yakult', 'chamyto', 'danone', 'chancliche',
        'presunto', 'mortadela', 'salame', 'salami', 'peito de peru', 'blanquet',
        'apresuntado', 'rosbife', 'copa', 'fatiado', 'antepasto', 'antepastos', 'patê', 'pate', 'frios',
        'alcaparra', 'alcaparrones', 'azeitona', 'conserva mix', 'tomate seco', 'salsicha ceratti', 'kroon', 'masdamer',
        'prima dona', 'vincent'
    ])) {
        return 'Mesa de Frios, Queijos e Antepastos';
    }
    // 2. Ingredientes para Feijoada e Churrasco
    if (match([
        'bacon', 'linguica', 'linguiça', 'charque', 'salsicha', 'carne', 'frango',
        'bovino', 'suino', 'suíno', 'cordeiro', 'costela', 'picanha', 'maminha',
        'alcatra', 'contra file', 'contra-file', 'contrafilé', 'contrafile',
        'file mignon', 'filé mignon', 'filé', 'file', 'coxa', 'sobrecoxa', 'asa',
        'coracao', 'coração', 'pernil', 'paleta', 'acem', 'acém', 'peito', 'lagarto',
        'patinho', 'coxão', 'coxao', 'carne seca', 'carne-seca', 'calabresa', 'paio',
        'chouriço', 'chourico', 'hambúrguer', 'hamburguer', 'burger', 'churrasco', 'feijoada',
        'espetinho', 'tulipa', 'linguiça toscana', 'salmorado', 'pertences para feijoada', 'joelho dicalani'
    ])) {
        return 'Ingredientes para Feijoada e Churrasco';
    }
    // 3. Pescados e Empório Tradicional Ibérico
    if (match([
        'bacalhau', 'salmao', 'salmão', 'peixe', 'atum', 'sardinha',
        'camarao', 'camarão', 'lula', 'polvo', 'lagosta', 'marisco',
        'mexilhao', 'mexilhão', 'tilapia', 'tilápia', 'merluza', 'pescada',
        'cação', 'cacao', 'tambaqui', 'pintado', 'truta', 'anchova', 'frutos do mar',
        'ibérico', 'iberico', 'paella', 'saith', 'zarbo'
    ])) {
        return 'Pescados e Empório Tradicional Ibérico';
    }
    // 4. Hora do Lanche e Snacks
    if (match([
        'amendoa', 'amêndoa', 'amendoas', 'amêndoas', 'castanha', 'nozes', 'noz', 'pistache',
        'amendoim', 'avela', 'avelã', 'macadamia', 'macadâmia', 'peca', 'pecã', 'pinhao', 'pinhão',
        'nuts', 'castanhas', 'biscoito', 'cookie', 'bolacha', 'salgadinho', 'snack', 'snacks',
        'batata palha', 'torrada', 'torradas', 'pão de queijo', 'pipoca', 'croissant', 'pão', 'pao',
        'baguete', 'ciabatta', 'brioche', 'bisnaga', 'rosca', 'biscoito de arroz', 'baru', 'chips jaca',
        'frispy', 'milho imp', 'milho pipoca', 'pinoles', 'pinholes', 'tremoço', 'tremoco'
    ])) {
        return 'Hora do Lanche e Snacks';
    }
    // 5. Confeitaria e Sobremesas
    if (match([
        'doce', 'doces', 'sobremesa', 'sobremesas', 'bolo', 'torta', 'tortas', 'brownie',
        'cupcake', 'confeitaria', 'chocolate', 'cacau', 'achocolatado', 'bala', 'jujuba',
        'gominha', 'goma', 'confeito', 'drageado', 'paçoca', 'pacoca', 'pé de moleque',
        'pe de moleque', 'crepe', 'waffle', 'sorvete', 'picolé', 'picole', 'gelato',
        'coco ralado', 'sucrilhos', 'cereja marrasquino', 'goiabada', 'halawi', 'po desnatado', 'po integral',
        'pe de moca', 'pé de moça', 'xilitol', 'eritritol', 'açúcar de coco', 'acucar de coco', 'leite de coco po',
        'fruta cristalizada', 'fruta glaceada'
    ])) {
        return 'Confeitaria e Sobremesas';
    }
    // 6. Mundo Fitness e Suplementação
    if (match([
        'whey', 'creatina', 'colageno', 'colágeno', 'spirulina', 'suplemento', 'suplementos',
        'bcaa', 'glutamina', 'albumina', 'proteina', 'proteína', 'fitness', 'maca peruana',
        'termogênico', 'termogenico', 'hipercalórico', 'hipercalorico', 'suplementacao', 'suplementação',
        'agar agar', 'alfarroba', 'extrasoy', 'soja proteina'
    ])) {
        return 'Mundo Fitness e Suplementação';
    }
    // 7. Empório Natural, Grãos e Farinhas Naturais
    if (match([
        'quinoa', 'chia', 'lentilha', 'trigo', 'aveia', 'grao', 'grão',
        'graos', 'grãos', 'cereal', 'cereais', 'semente', 'sementes', 'linhaca', 'linhaça',
        'girassol', 'gergelim', 'abobora', 'abóbora', 'arroz', 'feijao', 'feijão',
        'grao de bico', 'grão de bico', 'milho', 'ervilha', 'granola', 'musli', 'müsli',
        'flocos de milho', 'cevada', 'centeio', 'painço', 'painco', 'farinha', 'amido',
        'polvilho', 'fecula', 'fécula', 'maizena', 'tapioca', 'farofa', 'goma de mandioca',
        'creme de arroz', 'ameixa', 'tamara', 'tâmara', 'damasco', 'uva passa', 'uva-passa',
        'passas', 'goji berry', 'gojiberry', 'desidratada', 'desidratado', 'fruta desidratada',
        'frutas desidratadas', 'banana passa', 'figo turco', 'soja grao'
    ])) {
        return 'Empório Natural, Grãos e Farinhas Naturais';
    }
    // 8. Cantinho Árabe, Especiarias e Ervas
    if (match([
        'pimenta', 'pimentas', 'alho', 'caldos', 'caldo',
        'tempero', 'especiaria', 'especiarias', 'conserva', 'conservas', 'sal', 'sal grosso',
        'vinagre', 'azeite', 'oregano', 'orégano', 'manjericão', 'manjericao', 'alecrim',
        'tomilho', 'paprica', 'páprica', 'acafrao', 'açafrão', 'curry', 'cominho',
        'canela', 'cravo', 'louro', 'mostarda', 'ketchup', 'maionese', 'palmito',
        'pepino', 'champignon', 'cogumelo', 'chimichurri', 'colorau', 'noz-moscada',
        'noz moscada', 'salsa', 'cebolinha', 'coentro', 'hortela', 'hortelã',
        'árabe', 'arabe', 'hummus', 'kibe', 'tahine', 'coalhada seca', 'cardamomo',
        'catuaba', 'cebola', 'cha verde', 'chá verde', 'cidreira', 'couscous',
        'erva doce', 'erva folhas alecrim', 'fumaca po', 'fumaça pó', 'funcho', 'fung seco',
        'gengibre', 'ginseng', 'hibisco', 'marapuama', 'moringa', 'ora pro nobis',
        'polen desidratado', 'flor de sal'
    ])) {
        return 'Cantinho Árabe, Especiarias e Ervas';
    }
    // 9. Despensa e Utilidades Básicas (Default)
    return 'Despensa e Utilidades Básicas';
}
/**
 * Traduz um nome de categoria antigo para um nome novo.
 */
function mapOldCategoryToNew(oldCat, descricao) {
    const normalizedOld = (oldCat || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    // Mapeamento direto de nomes de categorias
    const map = {
        'queijos e laticinios': 'Mesa de Frios, Queijos e Antepastos',
        'embutidos, frios e carnes': descricao && /linguiça|linguica|carne|bovino|suino|suíno|frango|bacon|paio|calabresa/i.test(descricao)
            ? 'Ingredientes para Feijoada e Churrasco'
            : 'Mesa de Frios, Queijos e Antepastos',
        'peixes e frutos do mar': 'Pescados e Empório Tradicional Ibérico',
        'oleaginosas e castanhas': 'Hora do Lanche e Snacks',
        'frutas secas e desidratadas': 'Confeitaria e Sobremesas',
        'farinhas, amidos e polvilhos': 'Empório Natural, Grãos e Farinhas Naturais',
        'graos, cereais e sementes': 'Empório Natural, Grãos e Farinhas Naturais',
        'temperos, especiarias e conservas': 'Cantinho Árabe, Especiarias e Ervas',
        'suplementos, chas e produtos naturais': 'Mundo Fitness e Suplementação',
        'outros e utilidades': 'Despensa e Utilidades Básicas',
        'outros': 'Despensa e Utilidades Básicas',
        'padaria': 'Hora do Lanche e Snacks',
        'hortifruti': 'Despensa e Utilidades Básicas'
    };
    return map[normalizedOld] || oldCat || 'Despensa e Utilidades Básicas';
}
/**
 * Executa a migração das tabelas locais e arquivos de configuração para as 9 novas categorias.
 */
function migrateDatabaseAndConfigs(db) {
    console.log('[MIGRAÇÃO CATEGORIAS] 🚀 Iniciando migração para as 9 novas categorias oficiais...');
    const PERSISTENT_DIR = 'C:\\ChamaAi';
    const PERSISTENT_CAT_PATH = path.join(PERSISTENT_DIR, 'categorias.json');
    const dbPath = path.join(PERSISTENT_DIR, 'database.sqlite');
    const dbBackupPath = dbPath + '.migration_backup_v2';
    // 1. Checagem de Idempotência
    try {
        const migrado = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'categoria_migracao_v2'").get();
        if (migrado && (migrado.value === '1' || migrado.valor === '1')) {
            console.log('[MIGRAÇÃO CATEGORIAS] ℹ️ Migração v2 já executada anteriormente. Ignorando.');
            return;
        }
    }
    catch (err) {
        console.warn('[MIGRAÇÃO CATEGORIAS] ⚠️ Tabela configuracoes não estava disponível para checar idempotência:', err.message);
    }
    // 2. Backup do Banco de Dados SQLite
    try {
        if (fs.existsSync(dbPath)) {
            if (!fs.existsSync(dbBackupPath)) {
                fs.copyFileSync(dbPath, dbBackupPath);
                console.log(`[MIGRAÇÃO CATEGORIAS] 💾 Backup do banco criado com sucesso em: ${dbBackupPath}`);
            }
        }
    }
    catch (e) {
        console.error('[MIGRAÇÃO CATEGORIAS] ❌ Falha crítica ao realizar backup do banco SQLite:', e.message);
    }
    // 3. Atualizar arquivos JSON de mapeamento (categorias.json)
    const fallbackCatPaths = [
        path.join(__dirname, '../../server/categorias.json'),
        path.join(__dirname, 'categorias.json'),
        path.join(process.cwd(), 'server', 'categorias.json'),
    ];
    const updateJSONFile = (filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf-8').trim();
                if (!fileContent)
                    return;
                const data = JSON.parse(fileContent);
                if (typeof data === 'object' && !Array.isArray(data)) {
                    let changed = false;
                    for (const [plu, cat] of Object.entries(data)) {
                        if (typeof cat === 'string') {
                            const newCat = mapOldCategoryToNew(cat);
                            if (newCat !== cat) {
                                data[plu] = newCat;
                                changed = true;
                            }
                        }
                    }
                    if (changed) {
                        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
                        console.log(`[MIGRAÇÃO CATEGORIAS] ✅ Arquivo JSON atualizado: ${filePath}`);
                    }
                }
            }
        }
        catch (e) {
            console.warn(`[MIGRAÇÃO CATEGORIAS] Erro ao migrar arquivo JSON ${filePath}:`, e.message);
        }
    };
    updateJSONFile(PERSISTENT_CAT_PATH);
    for (const fallbackPath of fallbackCatPaths) {
        updateJSONFile(fallbackPath);
    }
    // 4. Migrar os produtos que já estão no banco de dados SQLite
    try {
        const produtos = db.prepare('SELECT plu, descricao, categoria FROM toledo_produtos').all();
        db.transaction((prods) => {
            const updateStmt = db.prepare('UPDATE toledo_produtos SET categoria = ? WHERE plu = ?');
            for (const p of prods) {
                let novaCat = mapOldCategoryToNew(p.categoria, p.descricao);
                // Se mapeou para 'Despensa e Utilidades Básicas', tenta classificar por keywords
                if (novaCat === 'Despensa e Utilidades Básicas') {
                    novaCat = getCategoryFromDescription(p.descricao);
                }
                updateStmt.run(novaCat, p.plu);
            }
            // Gravar flag de idempotência no banco
            db.prepare("INSERT OR REPLACE INTO configuracoes (chave, valor, atualizado_em) VALUES ('categoria_migracao_v2', '1', datetime('now'))").run();
        })(produtos);
        console.log(`[MIGRAÇÃO CATEGORIAS] ✅ SQLite 'toledo_produtos' migrado com sucesso (${produtos.length} produtos).`);
    }
    catch (err) {
        console.error('[MIGRAÇÃO CATEGORIAS] ❌ Erro ao migrar produtos no banco:', err.message);
    }
}
