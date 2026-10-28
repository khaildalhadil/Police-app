"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_SECONDS, checkCredentials, newSessionToken } from "@/lib/auth";

export async function login(formData: FormData) {
  const ok = checkCredentials(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down password guessing
    redirect("/login?e=1");
  }
  (await cookies()).set(SESSION_COOKIE, newSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS,
    path: "/",
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
