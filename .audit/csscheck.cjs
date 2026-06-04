const fs = require('fs');
const { execSync } = require('child_process');
const cssPath = execSync('ls dist/assets/index-*.css').toString().trim();
const raw = fs.readFileSync(cssPath, 'utf8');
// Tailwind escapes /, [, ], ., : with backslashes in selectors. Strip ALL
// backslashes so we can match the PLAIN class token unambiguously.
const flat = raw.replace(/\\/g, '');

// Every dynamic class the app builds via template literals, fully enumerated.
const colors = ['indigo','cyan','emerald','amber','rose','violet','purple','red'];
const templates = [
  'bg-C-500/20','bg-C-500/10','hover:bg-C-500/20',
  'text-C-400','text-C-300','hover:text-C-100',
  'border-C-500/30',
  'shadow-C-500/10','shadow-C-500/50','hover:shadow-C-500/10',
  'from-C-500/[0.05]','from-C-500/10','from-C-600/80','from-C-600/10',
  'to-C-600/60','to-C-400/10',
];
// A handful of static slash/opacity classes used across the app (regression canaries).
const statics = [
  'bg-zinc-900/70','bg-indigo-500/[0.08]','bg-white/5','border-white/10',
  'bg-zinc-800/60','from-indigo-500','to-violet-600','backdrop-blur-2xl',
];

function check(list, label) {
  const missing = list.filter(c => {
    // hover: variant generates ".hover:CLASS:hover" -> plain token still contains "CLASS"
    const token = c.replace(/^hover:/, '');
    return !flat.includes(token);
  });
  console.log(`${label}: ${list.length - missing.length}/${list.length} present`);
  if (missing.length) console.log('   MISSING:', missing.join(', '));
  return missing.length;
}

let miss = 0;
const dyn = [];
for (const c of colors) for (const t of templates) dyn.push(t.replace(/C/g, c));
miss += check(dyn, 'Dynamic safelist (128)');
miss += check(statics, 'Static slash/opacity canaries');
console.log(`\nCSS: ${(raw.length/1024).toFixed(1)} KB; TOTAL MISSING: ${miss}`);
