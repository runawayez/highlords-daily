import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const valueAfter = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const remove = args.includes('--remove');
const time = valueAfter('--time') || '07:00';
if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Use --time HH:MM, por exemplo --time 07:00');
const [hour, minute] = time.split(':').map(Number);
const root = path.resolve('.');

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(result.stderr || result.stdout || `${command} falhou`);
  }
  return result;
}

if (process.platform === 'win32') {
  const task = 'Highlords Daily';
  if (remove) {
    run('schtasks', ['/Delete', '/TN', task, '/F'], { stdio: 'inherit', allowFailure: true });
    console.log('Agendamento removido.');
  } else {
    const command = `cmd.exe /c "${path.join(root, 'GERAR-DAILY.bat')}"`;
    run('schtasks', ['/Create', '/SC', 'DAILY', '/ST', time, '/TN', task, '/TR', command, '/F'], { stdio: 'inherit' });
    console.log(`Agendado diariamente às ${time} pelo Windows Task Scheduler.`);
  }
} else if (process.platform === 'darwin') {
  const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.highlords.daily.plist');
  if (remove) {
    run('launchctl', ['unload', plist], { allowFailure: true });
    await fs.rm(plist, { force: true });
    console.log('Agendamento removido.');
  } else {
    await fs.mkdir(path.dirname(plist), { recursive: true });
    const script = path.join(root, 'RUN-DAILY.sh');
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>com.highlords.daily</string><key>ProgramArguments</key><array><string>/bin/bash</string><string>${script}</string></array><key>WorkingDirectory</key><string>${root}</string><key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict><key>StandardOutPath</key><string>${path.join(root, 'data', 'scheduler.log')}</string><key>StandardErrorPath</key><string>${path.join(root, 'data', 'scheduler-error.log')}</string></dict></plist>\n`;
    await fs.mkdir(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(plist, content, 'utf8');
    run('launchctl', ['unload', plist], { allowFailure: true });
    run('launchctl', ['load', plist]);
    console.log(`Agendado diariamente às ${time} via launchd.`);
  }
} else {
  const marker = '# highlords-daily';
  const existing = run('crontab', ['-l'], { allowFailure: true }).stdout || '';
  const clean = existing.split(/\r?\n/).filter(line => !line.includes(marker) && line.trim()).join('\n');
  if (remove) {
    const next = clean ? `${clean}\n` : '';
    run('crontab', ['-'], { input: next });
    console.log('Agendamento removido.');
  } else {
    const escapedRoot = root.replace(/'/g, `'\\''`);
    const line = `${minute} ${hour} * * * cd '${escapedRoot}' && /bin/bash RUN-DAILY.sh ${marker}`;
    const next = `${clean ? `${clean}\n` : ''}${line}\n`;
    run('crontab', ['-'], { input: next });
    console.log(`Agendado diariamente às ${time} via cron.`);
  }
}
