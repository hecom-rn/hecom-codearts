import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { showLogo } from '../utils/console';
import { logger } from '../utils/logger';

const PACKAGE_NAME = '@hecom/codearts';
const METHOD = 'npm';

function getPackageVersion(): string {
  const packageJsonPath = path.join(__dirname, '../../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version: string };

  return packageJson.version;
}

function getNpmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpm(args: string[], stdio: 'pipe' | 'inherit' = 'pipe'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(getNpmCommand(), args, {
      stdio,
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    }

    child.on('error', (error: Error) => {
      reject(new Error(`启动 npm 失败: ${error.message}`));
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf-8').trim());
        return;
      }

      const errorMessage = Buffer.concat(stderr).toString('utf-8').trim();
      reject(new Error(errorMessage || `npm 退出码: ${code ?? 'unknown'}`));
    });
  });
}

async function getLatestVersion(): Promise<string> {
  return runNpm(['view', PACKAGE_NAME, 'version']);
}

function logUpgradeStart(): void {
  showLogo();
  logger.info('┌  Upgrade');
  logger.info('│');
  logger.info(`●  Using method: ${METHOD}`);
  logger.info('│');
}

function logUpgradeEnd(): void {
  logger.info('│');
  logger.info('└  Done');
}

export async function upgradeCommand(): Promise<void> {
  logUpgradeStart();

  const currentVersion = getPackageVersion();
  const latestVersion = await getLatestVersion();

  if (currentVersion === latestVersion) {
    logger.info(`▲  codearts upgrade skipped: ${currentVersion} is already installed`);
    logUpgradeEnd();
    return;
  }

  logger.info(`●  Installing ${PACKAGE_NAME}@${latestVersion}`);
  await runNpm(['install', '-g', `${PACKAGE_NAME}@latest`]);
  logger.success(`◆  codearts upgraded: ${currentVersion} to ${latestVersion}`);
  logUpgradeEnd();
}
