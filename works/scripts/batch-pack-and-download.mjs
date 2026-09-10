import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { parseSocialLinkViaApia } from '../../app/shared/src/apiaScraper';

const CREDENTIALS = {
  clientId: '202037331',
  secretKey: '32843381450B00510784B97CBD53A7CDCD70844F87652F97FE'
};

const LOG_PATH = '/Users/huayuzulin/Library/Application Support/com.azhuo.workbench/api-dev.log';
const OUTPUT_DIR = path.join(process.env.HOME || '/Users/huayuzulin', 'Downloads', '全渠道批量采集成果_全量打包');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sanitizeName(name, fallback = 'PROD') {
  if (!name) return fallback;
  return name.replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().slice(0, 60) || fallback;
}

async function fetchImageBuffer(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://www.xiaohongshu.com/'
        },
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const arr = await res.arrayBuffer();
        return Buffer.from(arr);
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

async function runConcurrent(items, limit, fn) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      let attempts = 0;
      while (attempts < 3) {
        try {
          const res = await fn(items[currentIndex], currentIndex);
          results[currentIndex] = res;
          break;
        } catch (err) {
          attempts++;
          if (String(err).includes('429') || String(err).includes('QPS')) {
            console.warn(`  ⏳ 触发频控，等待 2 秒后重试...`);
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            await new Promise((r) => setTimeout(r, 800));
          }
        }
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log('🚀 开始从后台日志提取已采集链接...');
  const logContent = fs.readFileSync(LOG_PATH, 'utf-8');
  const lines = logContent.split('\n');
  const urls = [];
  const seen = new Set();

  for (const line of lines) {
    const m = line.match(/url=(https?:\/\/[^\s]+)/);
    if (m) {
      const u = m[1].trim();
      if (!seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
  }

  console.log(`📊 发现总共 ${urls.length} 个采集链接，正在开始 12 路高速解析与打包...`);

  const BATCH_SIZE = 50;
  const totalVolumes = Math.ceil(urls.length / BATCH_SIZE);

  for (let vol = 0; vol < totalVolumes; vol++) {
    const startIdx = vol * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, urls.length);
    const chunkUrls = urls.slice(startIdx, endIdx);

    console.log(`\n📦 [第 ${vol + 1}/${totalVolumes} 卷] 正在处理第 ${startIdx + 1} ~ ${endIdx} 款商品...`);
    const zip = new JSZip();
    const volumeFolderName = `全渠道批量采集_第${vol + 1}卷(${startIdx + 1}-${endIdx}款)`;
    const volFolder = zip.folder(volumeFolderName) || zip;

    let successInVol = 0;

    await runConcurrent(chunkUrls, 3, async (url, idxInChunk) => {
      const globalIdx = startIdx + idxInChunk + 1;
      try {
        const parseRes = await parseSocialLinkViaApia(url, CREDENTIALS);
        if (!parseRes.success || !parseRes.media) {
          console.warn(`  [#${globalIdx}] 解析跳过: ${parseRes.error || '无数据'}`);
          return;
        }

        const media = parseRes.media;
        const safeTitle = sanitizeName(media.title, `商品_${globalIdx}`);
        const prodFolder = volFolder.folder(`PROD_${globalIdx}-${safeTitle}`) || volFolder;

        // 写入文案
        const txt = `【小红书种草标题】：\n${media.title || ''}\n\n【正文内容】：\n${media.description || ''}\n\n【作者】：${media.author || ''}\n【原链接】：${url}\n`;
        prodFolder.file('小红书种草文案.txt', txt);

        // 下载图片
        const imgs = media.images || [];
        if (media.cover && !imgs.includes(media.cover)) imgs.unshift(media.cover);

        for (let i = 0; i < imgs.length; i++) {
          const imgUrl = imgs[i];
          const imgBuf = await fetchImageBuffer(imgUrl);
          if (imgBuf) {
            prodFolder.file(`shot_${String(i + 1).padStart(2, '0')}.jpg`, imgBuf);
          }
        }

        // 下载视频
        if (media.video) {
          const vidBuf = await fetchImageBuffer(media.video);
          if (vidBuf) {
            prodFolder.file('video_01.mp4', vidBuf);
          }
        }

        successInVol++;
        process.stdout.write(`  ✅ #${globalIdx} 完成 (${media.title.slice(0, 15)}... 共${imgs.length}图)\n`);
      } catch (err) {
        console.error(`  ❌ #${globalIdx} 异常:`, err.message);
      }
    });

    if (successInVol > 0) {
      console.log(`💾 正在生成第 ${vol + 1} 卷 ZIP 压缩包 (成功 ${successInVol} 款)...`);
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const zipFilePath = path.join(OUTPUT_DIR, `${volumeFolderName}.zip`);
      fs.writeFileSync(zipFilePath, zipBuffer);
      console.log(`🎉 已生成并保存: ${zipFilePath} (${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
    }
  }

  console.log(`\n=========================================================`);
  console.log(`🎉 全部商品已全部打包完成！`);
  console.log(`📂 保存目录: ${OUTPUT_DIR}`);
  console.log(`=========================================================`);
}

main().catch(console.error);
