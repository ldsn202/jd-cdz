// 十进制金额计算：全程字符串 + 整数标度，不使用浮点数。
// 约定：金额为不带指数、不带千分位的十进制字符串，可带正负号；零规范为 "0"。

type Parsed = { negative: boolean; digits: bigint; scale: number };

function parseAmount(input: string, label: string): Parsed {
  if (typeof input !== 'string' || input.length === 0) throw new Error(`${label} 必须为非空金额字符串`);
  let s = input.trim();
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`${label} 不是合法十进制金额：${input}`);
  const [intPart, fracPart = ''] = s.split('.');
  if (fracPart.length > 12) throw new Error(`${label} 小数位超过 12 位`);
  const digits = BigInt(intPart + fracPart);
  return { negative, digits, scale: fracPart.length };
}

function formatAmount(value: bigint, scale: number): string {
  if (value === 0n) return '0';
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const text = abs.toString().padStart(scale + 1, '0');
  let out: string;
  if (scale === 0) {
    out = text;
  } else {
    const intPart = text.slice(0, text.length - scale).replace(/^0+(?=\d)/, '');
    out = `${intPart}.${text.slice(text.length - scale)}`;
  }
  return negative ? `-${out}` : out;
}

function align(a: Parsed, b: Parsed): { x: bigint; y: bigint; scale: number } {
  const scale = Math.max(a.scale, b.scale);
  const scaleUp = (p: Parsed) => {
    const factor = 10n ** BigInt(scale - p.scale);
    const v = p.digits * factor;
    return p.negative ? -v : v;
  };
  return { x: scaleUp(a), y: scaleUp(b), scale };
}

export function normalizeAmount(input: string): string {
  const p = parseAmount(input, 'amount');
  return formatAmount(p.negative ? -p.digits : p.digits, p.scale);
}

export function addAmount(a: string, b: string): string {
  const { x, y, scale } = align(parseAmount(a, 'a'), parseAmount(b, 'b'));
  return formatAmount(x + y, scale);
}

export function subtractAmount(a: string, b: string): string {
  const { x, y, scale } = align(parseAmount(a, 'a'), parseAmount(b, 'b'));
  return formatAmount(x - y, scale);
}

export function compareAmount(a: string, b: string): number {
  const { x, y } = align(parseAmount(a, 'a'), parseAmount(b, 'b'));
  return x === y ? 0 : x > y ? 1 : -1;
}

export function isZeroAmount(a: string): boolean {
  return parseAmount(a, 'amount').digits === 0n;
}
