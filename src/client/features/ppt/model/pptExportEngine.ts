import JSZip from 'jszip';
import type { PptSlidePage } from '@shared/contracts/pptGeneration';

/** 导出高保真图片版 PPTX */
export async function exportPptxFile(pages: PptSlidePage[], projectTitle = '演示文稿') {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  let contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`;

  for (let i = 1; i <= pages.length; i++) {
    contentTypesXml += `\n  <Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  }
  contentTypesXml += '\n</Types>';
  zip.file('[Content_Types].xml', contentTypesXml);

  // 2. _rels/.rels
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
  zip.file('_rels/.rels', rootRels);

  // 3. ppt/_rels/presentation.xml.rels
  let presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
  for (let i = 1; i <= pages.length; i++) {
    presRels += `\n  <Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
  }
  presRels += '\n</Relationships>';
  zip.file('ppt/_rels/presentation.xml.rels', presRels);

  // 4. ppt/presentation.xml
  let presXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst/>
  <p:sldIdLst>`;
  for (let i = 1; i <= pages.length; i++) {
    presXml += `\n    <p:sldId id="${255 + i}" r:id="rId${i}"/>`;
  }
  presXml += `\n  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="12192000"/>
</p:presentation>`;
  zip.file('ppt/presentation.xml', presXml);

  // 5. 抓取图片并注入 slides
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const page = pages[i];
    const ver = page.versions.find((v) => v.id === page.currentVersionId) || page.versions[page.versions.length - 1];

    let imageBinary: ArrayBuffer | null = null;
    let ext = 'png';

    if (ver?.url.startsWith('data:image/svg+xml')) {
      // SVG to PNG via offscreen canvas
      imageBinary = await rasterizeSvgToPngBuffer(ver.url);
      ext = 'png';
    } else if (ver?.url.startsWith('data:image/')) {
      const match = ver.url.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
      if (match) {
        ext = match[1];
        imageBinary = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)).buffer;
      }
    } else if (ver?.url) {
      try {
        const resp = await fetch(ver.url);
        imageBinary = await resp.arrayBuffer();
        ext = ver.url.endsWith('.jpg') || ver.url.endsWith('.jpeg') ? 'jpeg' : 'png';
      } catch (err) {
        console.warn(`Failed to fetch image for page ${pageNum}:`, err);
      }
    }

    if (!imageBinary) {
      // 备用纯色占位图
      imageBinary = createFallbackPngBuffer();
    }

    const imgFileName = `image${pageNum}.${ext}`;
    zip.file(`ppt/media/${imgFileName}`, imageBinary);

    // ppt/slides/_rels/slide{n}.xml.rels
    const slideRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFileName}"/>
</Relationships>`;
    zip.file(`ppt/slides/_rels/slide${pageNum}.xml.rels`, slideRel);

    // ppt/slides/slide{n}.xml
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="SlideImage${pageNum}"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId1"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`;
    zip.file(`ppt/slides/slide${pageNum}.xml`, slideXml);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${projectTitle || '演示文稿'}.pptx`);
}

/** 导出全量 4K 图片 Zip 包 */
export async function exportImagesZip(pages: PptSlidePage[], projectTitle = '演示文稿') {
  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const page = pages[i];
    const ver = page.versions.find((v) => v.id === page.currentVersionId) || page.versions[page.versions.length - 1];
    if (ver?.url) {
      if (ver.url.startsWith('data:image/svg+xml')) {
        const pngBuf = await rasterizeSvgToPngBuffer(ver.url);
        zip.file(`slide_${String(pageNum).padStart(2, '0')}.png`, pngBuf);
      } else if (ver.url.startsWith('data:image/')) {
        const match = ver.url.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (match) {
          const buf = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0)).buffer;
          zip.file(`slide_${String(pageNum).padStart(2, '0')}.${match[1]}`, buf);
        }
      } else {
        try {
          const resp = await fetch(ver.url);
          const buf = await resp.arrayBuffer();
          zip.file(`slide_${String(pageNum).padStart(2, '0')}.png`, buf);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${projectTitle || '演示文稿'}_高清图片包.zip`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function rasterizeSvgToPngBuffer(svgDataUri: string): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(createFallbackPngBuffer());
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, 1920, 1080);
        canvas.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then(resolve);
            return;
          }
          resolve(createFallbackPngBuffer());
        }, 'image/png');
      } else {
        resolve(createFallbackPngBuffer());
      }
    };
    img.onerror = () => resolve(createFallbackPngBuffer());
    img.src = svgDataUri;
  });
}

function createFallbackPngBuffer(): ArrayBuffer {
  // 1x1 transparent png
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}
