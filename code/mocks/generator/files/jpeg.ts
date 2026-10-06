import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

export function pngToJpegWithComment(png: Buffer, comment: string, tmpBase: string): Buffer {
  const pngPath = `${tmpBase}.png`;
  const jpgPath = `${tmpBase}.jpg`;
  writeFileSync(pngPath, png);
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', pngPath, '--out', jpgPath], { stdio: 'pipe' });
    const jpg = readFileSync(jpgPath);
    if (jpg[0] !== 0xff || jpg[1] !== 0xd8) throw new Error('sips 输出不是合法 JPEG');
    const payload = Buffer.from(comment, 'utf8');
    if (payload.length > 65500) throw new Error('COM 段过长');
    const com = Buffer.alloc(4);
    com[0] = 0xff;
    com[1] = 0xfe;
    com.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([jpg.subarray(0, 2), com, payload, jpg.subarray(2)]);
  } finally {
    try { unlinkSync(pngPath); } catch { /* ignore */ }
    try { unlinkSync(jpgPath); } catch { /* ignore */ }
  }
}
