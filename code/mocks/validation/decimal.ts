export function toCents(amount: string): number {
  if (!/^-?\d+\.\d{2}$/.test(amount)) throw new Error(`非十进制金额字符串：${amount}`);
  const neg = amount.startsWith('-');
  const [i, f] = amount.replace('-', '').split('.');
  return (neg ? -1 : 1) * (Number(i) * 100 + Number(f));
}

export function fromCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function mulQtyPrice(quantity: string, unitPrice: string): string {
  const q = Number(quantity);
  if (!Number.isInteger(q) || q < 0) throw new Error(`数量非法：${quantity}`);
  return fromCents(q * toCents(unitPrice));
}

export function sum(amounts: string[]): string {
  return fromCents(amounts.reduce((a, x) => a + toCents(x), 0));
}
