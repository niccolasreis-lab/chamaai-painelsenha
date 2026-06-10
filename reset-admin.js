const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('C:/ChamaAi/database.sqlite');
const users = db.prepare('SELECT id, login, perfil FROM usuarios').all();
console.log('Users:', users);

// Reset admin password to 'admin'
const hash = bcrypt.hashSync('admin', 10);
db.prepare('UPDATE usuarios SET senha_hash = ? WHERE login = ?').run(hash, 'admin');
console.log('Admin password reset to "admin"');
