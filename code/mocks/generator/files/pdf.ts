import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export type PdfPage={lines:string[]};
// Embedded Unicode font keeps the original and rendered OCR input identical.
export function writePdf(title:string,pages:PdfPage[]):Buffer{
 const python=process.env.MOCK_PDF_PYTHON??fileURLToPath(new URL('../../../.local/pdf-env/bin/python',import.meta.url));
 return execFileSync(python,[fileURLToPath(new URL('./write-pdf.py',import.meta.url))],{input:JSON.stringify({title,pages}),maxBuffer:10*1024*1024});
}
