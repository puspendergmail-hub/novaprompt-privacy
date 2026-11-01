// Copies the pure game engines + catalog into functions/shared so the server
// validates moves with exactly the same rules as the client.
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'functions', 'shared');
mkdirSync(out, { recursive: true });
const engine = join(root, 'www', 'js', 'engine');
for (const f of readdirSync(engine)) {
  if (f.endsWith('.js') && f !== 'chessWorker.js') copyFileSync(join(engine, f), join(out, f));
}
copyFileSync(join(root, 'www', 'js', 'core', 'catalog.js'), join(out, 'catalog.js'));
console.log('shared engine synced to functions/shared');
