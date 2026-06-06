import 'dotenv/config';
import { initDatabase } from './electron/services/database';
import { startServer } from './server/index';

async function bootstrap() {
  console.log('Inicializando banco de dados (JSON Fallback)...');
  await initDatabase();
  
  console.log('Iniciando servidor da API...');
  startServer();
}

bootstrap().catch(console.error);
