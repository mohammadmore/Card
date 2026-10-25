// ساخت نسخه‌ی production:  npm install && npm run build
// خروجی: assets/app.js (کامپایل‌شده و minify) و assets/app.css (Tailwind فقط با کلاس‌های استفاده‌شده)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

await build({
  entryPoints: ['src/app.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  outfile: 'assets/app.js',
  legalComments: 'none',
});

execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'src/styles.css', '-o', 'assets/app.css', '--minify'], { stdio: 'inherit' });

mkdirSync('assets/fonts', { recursive: true });
copyFileSync('node_modules/vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2', 'assets/fonts/Vazirmatn-Variable.woff2');
copyFileSync('node_modules/vazirmatn/OFL.txt', 'assets/fonts/Vazirmatn-OFL.txt');
console.log('build done');
