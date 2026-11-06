import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "rop_session";
export const SESSION_SECONDS = 12 * 60 * 60;
// الإجازات الإدارية sit behind a second password that only the supervisor knows.
export const SUPERVISOR_COOKIE = "rop_supervisor";
export const SUPERVISOR_SECONDS = 2 * 60 * 60;

// Constant-time comparison of two strings of any length.
const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

// Tokens are signed with the passwords themselves, so changing one signs everyone out.
const appSecret = () => `${process.env.APP_USERNAME}\n${process.env.APP_PASSWORD}`;
const supervisorSecret = () => `supervisor\n${process.env.SUPERVISOR_PASSWORD}`;
const sign = (secret: string, exp: string) => createHmac("sha256", secret).update(exp).digest("hex");

function newToken(secret: string, seconds: number) {
  const exp = String(Date.now() + seconds * 1000);
  return `${exp}.${sign(secret, exp)}`;
}

async function hasToken(cookie: string, secret: string) {
  const token = (await cookies()).get(cookie)?.value;
  if (!token) return false;
  const [exp, sig = ""] = token.split(".");
  return Number(exp) > Date.now() && same(sig, sign(secret, exp));
}

export function checkCredentials(username: string, password: string) {
  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return false;
  const userOk = same(username.trim().toLowerCase(), user.toLowerCase());
  const passOk = same(password, pass);
  return userOk && passOk;
}

export function checkSupervisor(password: string) {
  const pass = process.env.SUPERVISOR_PASSWORD;
  return Boolean(pass) && same(password, pass!);
}

export const newSessionToken = () => newToken(appSecret(), SESSION_SECONDS);
export const newSupervisorToken = () => newToken(supervisorSecret(), SUPERVISOR_SECONDS);

export async function isLoggedIn() {
  return Boolean(process.env.APP_PASSWORD) && hasToken(SESSION_COOKIE, appSecret());
}

export async function isSupervisor() {
  return Boolean(process.env.SUPERVISOR_PASSWORD) && (await isLoggedIn()) && hasToken(SUPERVISOR_COOKIE, supervisorSecret());
}
