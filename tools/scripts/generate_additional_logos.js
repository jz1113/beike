const fs = require('fs');
const path = require('path');

const additionalLogos = {
  kimi: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#0B1528"/>
  <circle cx="12" cy="12" r="6" stroke="#3B82F6" stroke-width="2.5"/>
  <path d="M12 8v8M8 12h8" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"/>
</svg>`,

  meta: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M16.92 6C15.22 6 13.9 7.02 12.92 8.35 11.95 7.02 10.63 6 8.92 6 5.56 6 3 9.07 3 13.08c0 4.14 2.68 6.92 5.92 6.92 1.93 0 3.32-.98 4-2.02.68 1.04 2.07 2.02 4 2.02 3.24 0 5.92-2.78 5.92-6.92C22.84 9.07 20.28 6 16.92 6zm0 11.75c-1.8 0-3.08-1.78-3.92-3.83.92-2.22 2.22-3.67 3.92-3.67 1.83 0 3.25 1.78 3.25 3.75s-1.42 3.75-3.25 3.75zm-8 0c-1.83 0-3.25-1.78-3.25-3.75s1.42-3.75 3.25-3.75c1.7 0 3 1.45 3.92 3.67-.84 2.05-2.12 3.83-3.92 3.83z" fill="#0081FB"/>
</svg>`,

  mistral: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#FA5252"/>
  <path d="M6 6h3v3H6V6zm9 0h3v3h-3V6zm-9 9h3v3H6v-3zm9 0h3v3h-3v-3zm-4.5-4.5h3v3h-3v-3z" fill="#FFFFFF"/>
</svg>`,

  suno: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#000000"/>
  <circle cx="12" cy="12" r="5" fill="#FFFFFF"/>
  <path d="M12 3v3m0 12v3M3 12h3m12 0h3" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
</svg>`,

  stepfun: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#2563EB"/>
  <path d="M7 16l5-8 5 8H7z" fill="#FFFFFF"/>
</svg>`,

  yi: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#10B981"/>
  <path d="M12 6v12m-4-6h8" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
</svg>`
};

const dirs = [
  path.join(__dirname, '../public/logo'),
  path.join(__dirname, '../public/logos')
];

for (const [name, svgContent] of Object.entries(additionalLogos)) {
  dirs.forEach(dir => {
    const filePath = path.join(dir, `${name}.svg`);
    fs.writeFileSync(filePath, svgContent.trim(), 'utf8');
  });
}

console.log('Successfully wrote additional logos!');
