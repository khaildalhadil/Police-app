import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "rop_session";
export const SESSION_SECONDS = 12 * 60 * 60;

// Constant-time comparison of two strings of any length.
const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

// Signed with the credentials themselves, so changing the password signs everyone out.
const sign = (exp: string) =>
  createHmac("sha256", `${process.env.APP_USERNAME}\n${process.env.APP_PASSWORD}`).update(exp).digest("hex");

export function checkCredentials(username: string, password: string) {
  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return false;
  const userOk = same(username.trim().toLowerCase(), user.toLowerCase());
  const passOk = same(password, pass);
  return userOk && passOk;
}

export function newSessionToken() {
  const exp = String(Date.now() + SESSION_SECONDS * 1000);
  return `${exp}.${sign(exp)}`;
}

export async function isLoggedIn() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !process.env.APP_PASSWORD) return false;
  const [exp, sig = ""] = token.split(".");
  return Number(exp) > Date.now() && same(sig, sign(exp));
}
