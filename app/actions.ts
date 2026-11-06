"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_SECONDS,
  SUPERVISOR_COOKIE,
  SUPERVISOR_SECONDS,
  checkCredentials,
  checkSupervisor,
  isLoggedIn,
  newSessionToken,
  newSupervisorToken,
} from "@/lib/auth";

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge,
  path: "/",
});

const slowDown = () => new Promise((r) => setTimeout(r, 1000)); // slows down password guessing

export async function login(formData: FormData) {
  const ok = checkCredentials(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""));
  if (!ok) {
    await slowDown();
    redirect("/login?e=1");
  }
  (await cookies()).set(SESSION_COOKIE, newSessionToken(), cookieOptions(SESSION_SECONDS));
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(SUPERVISOR_COOKIE);
  redirect("/login");
}

export async function unlockLeaves(formData: FormData) {
  if (!(await isLoggedIn())) redirect("/login");
  if (!checkSupervisor(String(formData.get("password") ?? ""))) {
    await slowDown();
    redirect("/leaves?e=1");
  }
  (await cookies()).set(SUPERVISOR_COOKIE, newSupervisorToken(), cookieOptions(SUPERVISOR_SECONDS));
  redirect("/leaves");
}

export async function lockLeaves() {
  (await cookies()).delete(SUPERVISOR_COOKIE);
  redirect("/");
}
