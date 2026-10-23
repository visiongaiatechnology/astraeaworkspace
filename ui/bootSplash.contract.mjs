import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const htmlPath = fileURLToPath(new URL('./index.html', import.meta.url));
const cssPath = fileURLToPath(new URL('./src/app/bootstrap/bootSplash.css', import.meta.url));
const logoPath = fileURLToPath(
  new URL('./public/branding/astraea-workspace-official.png', import.meta.url),
);
const html = readFileSync(htmlPath, 'utf8');
const css = readFileSync(cssPath, 'utf8');
const officialLogo = readFileSync(logoPath);

test('static boot splash precedes the React root and uses the local Workspace mark', () => {
  const splashStart = html.indexOf('id="workspace-boot-splash"');
  const rootStart = html.indexOf('<div id="root"></div>');
  const moduleScriptStart = html.indexOf('<script type="module" src="/src/main.tsx"></script>');
  assert.ok(splashStart >= 0, 'static splash element exists');
  assert.ok(rootStart > splashStart, 'splash is present before the React root');
  assert.ok(moduleScriptStart > rootStart, 'splash is parsed before the React module starts');
  assert.match(html, /<link rel="stylesheet" href="\/src\/app\/bootstrap\/bootSplash\.css"\s*\/>/);
  assert.match(html, /data-min-visible-ms="600"/);
  assert.match(html, /role="status"\s+aria-label="Astraea Workspace is starting"/);
  assert.match(html, /src="\/branding\/astraea-workspace-official\.png"/);
  assert.doesNotMatch(html, /src="\/astraea-icons\/png\/128\/astraea-workspace\.png"/);
  assert.ok(existsSync(logoPath), 'local official Workspace logo variant exists');
  assert.deepEqual(officialLogo.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(officialLogo.readUInt32BE(16), 1366, 'official logo width is unchanged');
  assert.equal(officialLogo.readUInt32BE(20), 1151, 'official logo height is unchanged');
  assert.equal(officialLogo[25], 6, 'official PNG uses RGBA with an alpha channel');

  const splashEnd = html.indexOf('<div id="root"></div>', splashStart);
  const splashMarkup = html.slice(splashStart, splashEnd);
  assert.doesNotMatch(splashMarkup, /\sstyle\s*=/i, 'splash uses no inline styles');
  assert.doesNotMatch(splashMarkup, /<script\b/i, 'splash uses no inline JavaScript');

  const wordmarkMatch = splashMarkup.match(
    /<p class="workspace-boot-splash__wordmark" aria-hidden="true">([\s\S]*?)<\/p>/,
  );
  assert.ok(wordmarkMatch, 'animated wordmark is present');
  const letters = wordmarkMatch[1].match(
    /<span class="workspace-boot-splash__letter(?:\s[^\"]*)?">/g,
  );
  assert.equal(letters?.length, 17, 'wordmark has one span per visible character');
  const wordmark = wordmarkMatch[1]
    .replace(/&#32;/g, '__SPACE__')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, '')
    .replace('__SPACE__', ' ');
  assert.equal(wordmark, 'Astraea Workspace');
});

test('CSS caps the static splash at three seconds and honors reduced motion', () => {
  assert.match(
    css,
    /animation:\s*workspace-boot-splash-deadline\s+3000ms\s+linear\s+both;/,
  );
  assert.match(
    css,
    /#workspace-boot-splash\.workspace-boot-splash--exiting\s*\{\s*animation:\s*workspace-boot-splash-ready-exit\s+160ms/,
  );
  assert.match(
    css,
    /@keyframes workspace-boot-splash-deadline\s*\{[\s\S]*?100%\s*\{\s*opacity:\s*0;\s*visibility:\s*hidden;\s*pointer-events:\s*none;/,
  );
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(
    css,
    /#workspace-boot-splash\.workspace-boot-splash--exiting\s*\{\s*animation:\s*none;\s*opacity:\s*0;\s*visibility:\s*hidden;/,
  );
  assert.match(
    css,
    /animation:\s*workspace-boot-splash-deadline-static\s+3000ms\s+steps\(1,\s*end\)\s+both;/,
  );
  assert.match(css, /\.workspace-boot-splash__letter\s*\{\s*opacity:\s*1;\s*transform:\s*none;\s*animation:\s*none;/);
  assert.match(css, /\.workspace-boot-splash__letter:nth-child\(17\)\s*\{\s*animation-delay:\s*320ms;/);
  assert.match(css, /animation:\s*workspace-boot-letter-in\s+240ms/);
  assert.doesNotMatch(css, /@import\b|url\(\s*['"]?https?:/i, 'CSS has no remote dependencies');
});
