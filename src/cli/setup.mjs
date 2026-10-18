import readline from "node:readline";
import { runSetup, SetupCancelled } from "../setup/wizard.mjs";
// Async iteration retains early/piped answers. EOF never silently saves defaults.
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
try {
  await runSetup({
    ask: async (prompt) => {
      process.stdout.write(prompt);
      const line = await lines.next();
      return line.done ? null : line.value;
    },
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = error instanceof SetupCancelled ? 0 : 1;
} finally {
  rl.close();
}
