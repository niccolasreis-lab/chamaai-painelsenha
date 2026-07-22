const dotenv = require('dotenv');

dotenv.config({ path: 'C:/ChamaAi/.env', quiet: true });

const database = require('../dist-electron/electron/services/database.js');
const sync = require('../dist-electron/server/supabase-sync.js');

// Electron-as-Node may inherit a short-lived stdout pipe from desktop runners.
// The bootstrap is verified from SQLite/Supabase state, so library logging is
// silenced to prevent EPIPE from interrupting the durable outbox.
console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.error = () => {};

const PUBLIC_CONFIG_KEYS = [
  'categorias_ordem',
  'cor_primaria',
  'logo_cliente_base64',
  'nome_estabelecimento',
  'portal_som_prestes_chamar',
  'portal_som_sua_vez',
  'portal_voz_alerta',
  'telao_ticker_texto',
  'toledo_encarte_ativo',
  'toledo_ocultar_em_falta',
];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const init = await database.initDatabase({ appVersion: '1.0.161' });
  if (init.status !== 'OK') {
    throw new Error(`Database initialization failed: ${init.status} ${init.reason || ''}`);
  }

  const db = database.getDb();
  const tickets = db.prepare(
    'SELECT id, numero, status, preferencial FROM senhas ORDER BY id'
  ).all();
  const products = db.prepare(
    'SELECT plu, descricao, preco, categoria FROM toledo_produtos ORDER BY plu'
  ).all();
  const placeholders = PUBLIC_CONFIG_KEYS.map(() => '?').join(',');
  const configs = db.prepare(
    `SELECT chave, valor FROM configuracoes WHERE chave IN (${placeholders}) ORDER BY chave`
  ).all(...PUBLIC_CONFIG_KEYS);

  const alreadyQueued = db.prepare('SELECT count(*) AS total FROM supabase_sync_queue').get().total;
  if (alreadyQueued === 0) {
    for (const ticket of tickets) {
      sync.syncNovaSenha(
        ticket.id,
        ticket.numero,
        ticket.status,
        Boolean(ticket.preferencial),
      );
    }
    sync.syncProdutos(products);
    for (const config of configs) {
      sync.syncConfiguracaoPublica(config.chave, config.valor);
    }
  }

  sync.startSyncWorker();
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await wait(1000);
    const state = db.prepare(
      'SELECT count(*) AS total, coalesce(sum(case when tentativas > 0 then 1 else 0 end), 0) AS retried FROM supabase_sync_queue'
    ).get();
    if (state.total === 0) {
      sync.stopSyncWorker();
      database.closeDatabase();
      return;
    }
  }

  sync.stopSyncWorker();
  const state = db.prepare(
    'SELECT count(*) AS total, coalesce(sum(case when tentativas > 0 then 1 else 0 end), 0) AS retried FROM supabase_sync_queue'
  ).get();
  database.closeDatabase();
  throw new Error(`Cloud sync timed out: ${JSON.stringify(state)}`);
}

main().catch(() => {
  try { database.closeDatabase(); } catch (_) {}
  process.exit(1);
});
