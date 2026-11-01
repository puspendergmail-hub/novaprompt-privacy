// Loads database.rules.json into the emulator namespace the functions use
// (the emulator only auto-applies rules to the "-default-rtdb" namespace).
import { readFileSync } from 'node:fs';
const rules = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');
export const DB_NS = 'demo-neon-takkar';
export async function loadRules() {
  const r = await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${DB_NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules });
  if (!r.ok) throw new Error('Could not load RTDB rules into emulator: ' + r.status);
}
