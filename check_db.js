const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'chamaai-novo', 'database.sqlite');
console.log('DB path:', dbPath);

// We use the Electron-compiled version
const electronDb = require('./node_modules/better-sqlite3/build/Release/better_sqlite3.node');
console.log('Native module loaded from:', require.resolve('better-sqlite3'));
