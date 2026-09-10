import { createRequire } from 'node:module';
import ffprobeStatic from 'ffprobe-static';

const require = createRequire(import.meta.url);
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function tryExec(label, binary) {
  try {
    const { stdout } = await execFileAsync(binary, ['-version'], { timeout: 10000 });
    console.log(label, 'OK', stdout.split('\n')[0]);
    return true;
  } catch (error) {
    console.log(label, 'FAIL', error.code, error.message);
    return false;
  }
}

console.log('ffmpegPath:', ffmpegPath);
console.log('ffprobePath:', ffprobeStatic.path);
if (ffmpegPath) {
  console.log('ffmpeg exists:', fs.existsSync(ffmpegPath));
  console.log('ffmpeg executable bit:', Boolean(fs.statSync(ffmpegPath).mode & 0o111));
}
await tryExec('ffmpeg', ffmpegPath);
await tryExec('ffprobe', ffprobeStatic.path);
