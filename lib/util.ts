export const pad = (n: number) => String(n).padStart(2, "0");

export const toLatinDigits = (s: unknown) =>
  String(s ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

// Loose Arabic matching for search: drop diacritics/tatweel, unify alef, ta marbuta and ya.
export const norm = (s: unknown) =>
  toLatinDigits(s)
    .toLowerCase()
    .replace(/[ً-ٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();

export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (v: string, n: number) => {
  const [y, m, d] = v.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + n));
};

export const fmtDate = (v?: string) => {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
};

export const fmtDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const dayNum = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const daysBetween = (a: string, b: string) => Math.round(dayNum(b) - dayNum(a));

export function ageFrom(dob: string) {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = todayStr().split("-").map(Number);
  let a = ty - y;
  if (tm < m || (tm === m && td < d)) a--;
  return a;
}

export function daysText(n: number) {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومين";
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

export function fmtSize(b?: number) {
  if (b == null) return "";
  const u = ["بايت", "ك.ب", "م.ب", "ج.ب"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function fileExt(name?: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toUpperCase().slice(0, 4) : "FILE";
}

export function fileClass(name: string, type: string) {
  const e = fileExt(name).toLowerCase();
  if (e === "pdf" || type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "img";
  if (["doc", "docx", "rtf", "odt"].includes(e)) return "doc";
  if (["xls", "xlsx", "csv"].includes(e)) return "xls";
  return "";
}

export type Status = { key: "released" | "detained" | "none"; text: string };

// A release date only counts once it has arrived; until then the person is still detained.
export function statusOf(r: { releaseDate?: string; detentionDate?: string }): Status {
  if (r.releaseDate && r.releaseDate <= todayStr()) return { key: "released", text: "مُفرج عنه" };
  if (r.detentionDate) return { key: "detained", text: "محتجز" };
  return { key: "none", text: "غير محدد" };
}

export function dueOf(date: string) {
  const n = daysBetween(todayStr(), date);
  if (n < 0) return { n, cls: "overdue", label: `متأخر ${daysText(-n)}` };
  if (n === 0) return { n, cls: "today", label: "اليوم" };
  if (n === 1) return { n, cls: "soon", label: "غداً" };
  return { n, cls: n <= 3 ? "soon" : "later", label: `بعد ${daysText(n)}` };
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function openBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  if (!window.open(url, "_blank")) downloadBlob(blob, name);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export const blobToDataURL = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

export function dataURLToBlob(d: string) {
  const mime = /^data:([^;,]+)/.exec(d)?.[1] || "application/octet-stream";
  const bin = atob(d.slice(d.indexOf(",") + 1));
  const arr = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
  return new Blob([arr], { type: mime });
}
