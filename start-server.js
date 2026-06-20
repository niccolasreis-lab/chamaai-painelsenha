"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const database_1 = require("./electron/services/database");
const index_1 = require("./server/index");
async function bootstrap() {
    console.log('Inicializando banco de dados (JSON Fallback)...');
    await (0, database_1.initDatabase)({ appVersion: '0.0.0-dev' });
    console.log('Iniciando servidor da API...');
    (0, index_1.startServer)();
}
bootstrap().catch(console.error);
