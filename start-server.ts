import 'dotenv/config';
import { initDatabase } from './electron/services/database';
import { startServer } from './server/index';

async function bootstrap() {
  console.log('Inicializando banco de dados (JSON Fallback)...');
  await initDatabase({ appVersion: '0.0.0-dev' });
  
  console.log('Iniciando servidor da API...');
  startServer();
}

bootstrap().catch(console.error);
