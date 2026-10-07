import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.mjs';

const args = new Set(process.argv.slice(2));
const clearOutput = args.has('--all') || args.has('--output');

function fallbackMemoryFile() {
  const parsed = path.parse(config.memoryFile);
  return path.join(parsed.dir, `${parsed.name}.json`);
}

async function remove(target, label) {
  try {
    await fs.rm(target, { recursive: true, force: true });
    console.log(`  ✓ ${label}: ${target}`);
  } catch (error) {
    throw new Error(`Falha ao remover ${label} (${target}): ${error.message || error}`);
  }
}

async function main() {
  console.log('\nHIGH LORDS DAILY — RESET LOCAL\n');
  console.log('Limpando memória editorial e histórico local...');

  const memoryTargets = new Set([
    config.dataDir,
    config.memoryFile,
    `${config.memoryFile}-wal`,
    `${config.memoryFile}-shm`,
    fallbackMemoryFile()
  ]);

  for (const target of memoryTargets) {
    await remove(target, 'memória local');
  }

  if (clearOutput) {
    console.log('\nLimpando também as edições geradas...');
    await remove(config.outputDir, 'output');
  }

  console.log('\nPronto. A próxima geração não terá memória de matérias anteriores.');
  if (!clearOutput) {
    console.log('As edições existentes em output/ foram preservadas. Use --all para apagá-las também.');
  }
}

main().catch(error => {
  console.error(`\nErro: ${error.message || error}`);
  process.exitCode = 1;
});
