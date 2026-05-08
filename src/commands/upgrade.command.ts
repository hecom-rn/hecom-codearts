import { spawn } from 'child_process';
import { logger } from '../utils/logger';

const PACKAGE_NAME = '@hecom/codearts';

export async function upgradeCommand(): Promise<void> {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['install', '-g', `${PACKAGE_NAME}@latest`];

  logger.info(`正在升级 ${PACKAGE_NAME} 到最新版本...`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error: Error) => {
      reject(new Error(`启动 npm 失败: ${error.message}`));
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`升级失败，npm 退出码: ${code ?? 'unknown'}`));
    });
  });

  logger.success(`${PACKAGE_NAME} 已升级到最新版本`);
}
