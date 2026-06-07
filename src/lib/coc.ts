// COC 계산 헬퍼 (테스트 대상)
export function parseSpec(s: string) {
  let size = "", comp = "";
  if (s.includes(":")) { const p = s.split(":"); size = p[0].trim(); comp = p.slice(1).join(":").trim(); }
  else size = s.trim();
  size = size.replace(/^(MSL_|Metco_|SNP_|SNP |Metco )/i, "").trim();
  return { size, comp };
}
export function gravitySpec(size: string) {
  if (/16-25/.test(size)) return "9.6 ± 0.05";
  if (/25-32/.test(size)) return "9.5 ± 0.05";
  if (/32-45/.test(size)) return "9.3 ± 0.05";
  return "9.x ± 0.05";
}
export function addYear(iso: string) {
  if (!iso) return "";
  const d = new Date(iso); const e = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}`;
}
