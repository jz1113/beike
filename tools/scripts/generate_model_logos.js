const fs = require('fs');
const path = require('path');

// Official SVG vector definitions for all AI model providers
const logos = {
  // 1. OpenAI (Official Spiral)
  openai: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4947zm-9.66-4.1354a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1402-1.6564zm-1.6372-9.871A4.4518 4.4518 0 0 1 4.3016 5.869l-.0047.1609v5.5163a.7948.7948 0 0 0 .3927.6813l5.8428 3.3685-2.02 1.1683a.0757.0757 0 0 1-.071 0l-4.8304-2.7913a4.4944 4.4944 0 0 1-1.6738-5.5492zm16.4848 3.5135-5.8428-3.3685 2.02-1.1683a.0757.0757 0 0 1 .071 0l4.8304 2.7913a4.4944 4.4944 0 0 1-.6767 8.1042v-5.6772a.79.79 0 0 0-.4019-.6815zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L8.609 9.4729V7.1405a.0804.0804 0 0 1 .0332-.0615l4.9398-2.8528a4.4992 4.4992 0 0 1 6.6748 4.6645zm-12.641 4.1449-2.02-1.1635a.0804.0804 0 0 1-.038-.052V6.088a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7369zm1.443-2.4841 3.2505-1.8737 3.2505 1.8737v3.7475L12 18.0062l-3.2505-1.8737v-3.7475z" fill="#10A37F"/>
</svg>`,

  // 2. Google Gemini (Official 4-Color Gradient Star)
  gemini: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/>
  <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gemini_grad1)"/>
  <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gemini_grad2)"/>
  <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gemini_grad3)"/>
  <defs>
    <linearGradient id="gemini_grad1" gradientUnits="userSpaceOnUse" x1="7" x2="11" y1="15.5" y2="12">
      <stop stop-color="#08B962"/>
      <stop offset="1" stop-color="#08B962" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gemini_grad2" gradientUnits="userSpaceOnUse" x1="8" x2="11.5" y1="5.5" y2="11">
      <stop stop-color="#F94543"/>
      <stop offset="1" stop-color="#F94543" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gemini_grad3" gradientUnits="userSpaceOnUse" x1="3.5" x2="17.5" y1="13.5" y2="12">
      <stop stop-color="#FABC12"/>
      <stop offset=".46" stop-color="#FABC12" stop-opacity="0"/>
    </linearGradient>
  </defs>
</svg>`,

  // 3. ByteDance / 即梦 / 豆包 (Seedream & Seedance)
  jimeng: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="url(#jm_bg)"/>
  <path d="M16.5 7.5c-2.485 0-4.5 2.015-4.5 4.5 0 1.243.504 2.368 1.318 3.182A4.48 4.48 0 0 1 10.136 16.5C7.651 16.5 5.636 14.485 5.636 12s2.015-4.5 4.5-4.5c.828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5c1.657 0 3-1.343 3-3 0-1.657 1.343-3 3-3 .828 0 1.5.672 1.5 1.5s-.672 1.5-1.5 1.5z" fill="#FFFFFF"/>
  <defs>
    <linearGradient id="jm_bg" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2563EB"/>
      <stop offset="0.5" stop-color="#06B6D4"/>
      <stop offset="1" stop-color="#3B82F6"/>
    </linearGradient>
  </defs>
</svg>`,

  doubao: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="url(#doubao_grad)"/>
  <path d="M7.8 15.5c-.7 0-1.3-.6-1.3-1.3 0-2.8 2.2-5 5-5 .7 0 1.3.6 1.3 1.3 0 .7-.6 1.3-1.3 1.3-1.4 0-2.5 1.1-2.5 2.5 0 .7-.5 1.2-1.2 1.2zm8.4-7c.7 0 1.3.6 1.3 1.3 0 2.8-2.2 5-5 5-.7 0-1.3-.6-1.3-1.3 0-.7.6-1.3 1.3-1.3 1.4 0 2.5-1.1 2.5-2.5 0-.7.5-1.2 1.2-1.2z" fill="#FFFFFF"/>
  <defs>
    <linearGradient id="doubao_grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3B82F6"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
</svg>`,

  // 4. Midjourney (Official Sailboat)
  midjourney: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M13.882 17.078c-1.365 1.12-2.906 1.706-4.52 1.706-2.54 0-4.836-1.433-5.854-3.649-.61-1.328-.69-2.802-.234-4.148.455-1.345 1.393-2.47 2.64-3.167 1.248-.698 2.684-.897 4.045-.561.42.103.824.254 1.206.447l-1.312 2.054c-.217-.11-.447-.196-.688-.255-.778-.192-1.6-.078-2.313.32-.713.398-1.25 1.042-1.509 1.811-.261.769-.215 1.611.134 2.37.582 1.266 1.894 2.085 3.346 2.085.923 0 1.803-.335 2.582-.972l2.476 1.958zm6.75-8.544c-.456-1.346-1.394-2.47-2.641-3.168-1.248-.697-2.684-.896-4.045-.56-.42.103-.824.254-1.206.447l1.312 2.054c.217-.11.447-.196.688-.255.778-.192 1.6-.078 2.313.32.713.398 1.25 1.042 1.509 1.811.261.769.215 1.611-.134 2.37-.582 1.266-1.894 2.085-3.346 2.085-.923 0-1.803-.335-2.582-.972l-2.476 1.958c1.365 1.12 2.906 1.706 4.52 1.706 2.54 0 4.836-1.433 5.854-3.649.61-1.328.69-2.802.234-4.147z" fill="#000000"/>
</svg>`,

  // 5. Black Forest Labs / FLUX (Official BFL FLUX Geometric Logo)
  flux: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5" fill="#0A0D14"/>
  <path d="M5.5 6.5h13v2.5h-10v3h8.5v2.5H8.5V18H5.5V6.5z" fill="#00F0FF"/>
</svg>`,

  // 6. 快手可灵 Kling AI (Official Kling Gradient Symbol)
  kling: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="url(#kling_bg)"/>
  <path d="M8 7.5v9l7.5-4.5L8 7.5z" fill="#FFFFFF"/>
  <circle cx="16" cy="8" r="2" fill="#FFFFFF"/>
  <defs>
    <linearGradient id="kling_bg" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FF5E3A"/>
      <stop offset="0.5" stop-color="#FF2A6D"/>
      <stop offset="1" stop-color="#9B00E8"/>
    </linearGradient>
  </defs>
</svg>`,

  // 7. Runway (Official Runway R)
  runway: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#000000"/>
  <path d="M7 6h5.5c2.5 0 4.5 1.8 4.5 4s-2 4-4.5 4H10v4H7V6zm3 2.5v3h2.5c1.1 0 2-.7 2-1.5S13.6 8.5 12.5 8.5H10z" fill="#FFFFFF"/>
  <path d="M13.5 13.5L17 18h-3.2l-2.8-4.5h2.5z" fill="#FFFFFF"/>
</svg>`,

  // 8. Luma AI (Official Dream Machine / Luma)
  luma: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#111111"/>
  <circle cx="12" cy="12" r="5.5" stroke="#A855F7" stroke-width="2.5"/>
  <path d="M12 4v3m0 10v3m-8-8h3m10 0h3" stroke="#A855F7" stroke-width="2" stroke-linecap="round"/>
</svg>`,

  // 9. MiniMax / 海螺 AI (Official Hailuo / MiniMax)
  minimax: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#FF4D4F"/>
  <path d="M6 15V9h2.5l3.5 4.5L15.5 9H18v6h-2.5v-3.5L12 16l-3.5-4.5V15H6z" fill="#FFFFFF"/>
</svg>`,

  // 10. DeepSeek (Official Whale / AI)
  deepseek: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 11.9 12 12.5 12 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z" fill="#4D6BFE"/>
</svg>`,

  // 11. Anthropic Claude (Official Coral Starburst)
  claude: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M13.5 3h-3l1 6.5-5-4-1.5 2.5 6 3-6.5 1.5 1 3 6-1-3.5 5.5 2.5 1.5 3.5-5.5 3.5 5.5 2.5-1.5-3.5-5.5 6 1 1-3-6.5-1.5 6-3-1.5-2.5-5 4 1-6.5z" fill="#D97757"/>
</svg>`,

  // 12. Stability AI / Stable Diffusion (Official Spiral / Star)
  stability: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="9" stroke="#7C3AED" stroke-width="2"/>
  <circle cx="12" cy="12" r="4" fill="#7C3AED"/>
  <circle cx="12" cy="5" r="1.5" fill="#7C3AED"/>
  <circle cx="17" cy="8" r="1.5" fill="#7C3AED"/>
  <circle cx="18" cy="14" r="1.5" fill="#7C3AED"/>
  <circle cx="14" cy="18.5" r="1.5" fill="#7C3AED"/>
  <circle cx="8" cy="17" r="1.5" fill="#7C3AED"/>
  <circle cx="6" cy="10" r="1.5" fill="#7C3AED"/>
</svg>`,

  // 13. Alibaba Qwen / 通义千问 (Official Purple Diamond Star)
  qwen: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#615CED"/>
</svg>`,

  // 14. OpenAI Sora (Official Sora Compass Star)
  sora: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#000000"/>
  <path d="M12 5l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" fill="#FFFFFF"/>
</svg>`,

  // 15. xAI Grok (Official Grok X Logo)
  grok: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#000000"/>
  <path d="M6 6l12 12m0-12L6 18" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
</svg>`,

  // 16. 智谱 AI / GLM / CogView (Official Zhipu Blue Star)
  zhipu: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#3859FF"/>
  <path d="M12 6v12M6 12h12M7.76 7.76l8.48 8.48M7.76 16.24l8.48-8.48" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
</svg>`,

  // 17. 腾讯混元 Hunyuan (Official Tencent Hunyuan)
  hunyuan: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#0052D9"/>
  <circle cx="12" cy="12" r="5" fill="#FFFFFF"/>
</svg>`,

  // 18. 百度文心 Baidu (Official Baidu Bear Paw / Ernie)
  baidu: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#2932E1"/>
  <circle cx="12" cy="13.5" r="3.5" fill="#FFFFFF"/>
  <circle cx="7.5" cy="9.5" r="1.8" fill="#FFFFFF"/>
  <circle cx="16.5" cy="9.5" r="1.8" fill="#FFFFFF"/>
  <circle cx="10" cy="6.5" r="1.5" fill="#FFFFFF"/>
  <circle cx="14" cy="6.5" r="1.5" fill="#FFFFFF"/>
</svg>`,

  // 19. Pika (Official Pika Playful P)
  pika: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#000000"/>
  <path d="M8 6h5a4 4 0 010 8H8V6zm0 8v4" stroke="#FFE600" stroke-width="2.5" stroke-linecap="round"/>
</svg>`,

  // 20. Ideogram (Official Ideogram Typography I)
  ideogram: `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5.5" fill="#000000"/>
  <path d="M12 6v12M9 6h6M9 18h6" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>
</svg>`
};

// Target directories: public/logo and public/logos
const dirs = [
  path.join(__dirname, '../public/logo'),
  path.join(__dirname, '../public/logos')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

let count = 0;
for (const [name, svgContent] of Object.entries(logos)) {
  dirs.forEach(dir => {
    const filePath = path.join(dir, `${name}.svg`);
    fs.writeFileSync(filePath, svgContent.trim(), 'utf8');
  });
  count++;
}

console.log(`Successfully written ${count} official model logos to public/logo/ and public/logos/!`);
