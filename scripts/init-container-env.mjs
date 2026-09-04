import fs from 'node:fs';
import crypto from 'node:crypto';
const secret = () => crypto.randomBytes(32).toString('hex');
const path = new URL('../.env.container', import.meta.url);
try {
  fs.writeFileSync(path, `DB_PASSWORD=${secret()}\nMYSQL_ROOT_PASSWORD=${secret()}\nJWT_SECRET=${secret()}\nBIND_ADDRESS=127.0.0.1\nAPP_PORT=9280\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created .env.container with random credentials.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.container already exists; preserved.');
}
