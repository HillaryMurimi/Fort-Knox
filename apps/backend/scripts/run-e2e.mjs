import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const child = spawn(process.execPath, [vitest, 'run', 'tests/e2e/backend.contract.test.ts', 'tests/e2e/finance.transaction.e2e.test.ts', 'tests/e2e/landlord-onboarding.e2e.test.ts', 'tests/e2e/platform-business.e2e.test.ts', 'tests/e2e/admin-auth.e2e.test.ts', 'tests/e2e/sales-demo.e2e.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_E2E: '1', RUN_TRANSACTION_E2E: '1' },
});

child.on('error', (error) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
