import * as fs from 'fs';
import * as path from 'path';

export function writeRecoveryLog(message: string, error?: any) {
  // Always use the robust absolute path expected in production
  const logDir = 'C:\\ChamaAi\\logs';
  const logPath = path.join(logDir, 'recovery.log');
  
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const errorStr = error ? (error instanceof Error ? error.stack || error.message : JSON.stringify(error)) : '';
    fs.appendFileSync(logPath, `[${timestamp}] ${message} ${errorStr}\n`);
  } catch (e) {
    console.error('Failed to write to recovery log:', e);
  }
}
