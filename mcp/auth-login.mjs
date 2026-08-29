import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { clearSessionFile, passwordSignIn, saveSessionFile, sessionFilePath } from './auth-session.mjs';

const env = process.env;

async function askLine(question, defaultValue = '') {
  const prompt = defaultValue ? `${question} [${defaultValue}] ` : `${question} `;
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await readline.question(prompt)).trim();
    return answer || defaultValue;
  } finally {
    readline.close();
  }
}

async function askSecret(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') return askLine(question);
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          cleanup();
          stdout.write('\n');
          resolve(null);
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f') {
          if (value) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += character;
        stdout.write('*');
      }
    };
    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const filePath = sessionFilePath(env);
  if (process.argv.includes('--logout')) {
    await clearSessionFile(filePath);
    console.log(`Sesiunea locală a fost eliminată: ${filePath}`);
    return;
  }

  const email = await askLine('Email Supabase', env.MOLDOVENEASCA_SUPABASE_EMAIL || '');
  const password = await askSecret('Parola Supabase (nu se afișează): ');
  if (!password) {
    console.error('Autentificarea a fost anulată.');
    process.exitCode = 1;
    return;
  }

  const session = await passwordSignIn({
    url: env.MOLDOVENEASCA_SUPABASE_URL || env.SUPABASE_URL,
    key: env.MOLDOVENEASCA_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY,
    email,
    password
  });
  await saveSessionFile(filePath, session);
  console.log(`Autentificarea Supabase a fost salvată local în ${filePath}.`);
  console.log('Parola nu a fost salvată. Repornește Codex pentru ca MCP-ul să folosească sesiunea.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
