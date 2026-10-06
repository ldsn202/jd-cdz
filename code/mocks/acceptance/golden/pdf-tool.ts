import { execFileSync } from 'node:child_process';

export function pdfPagesViaTool(abs: string): number | null {
  try {
    const out = execFileSync('pdfinfo', [abs], { stdio: 'pipe' }).toString();
    const m = out.match(/^Pages:\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
