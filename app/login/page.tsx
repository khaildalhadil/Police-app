import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import logo from "@/public/rop-logo.jpg";
import { Icon } from "@/components/icon";
import { PasswordField } from "@/components/password-field";
import { isLoggedIn } from "@/lib/auth";
import { login } from "../actions";

export const metadata: Metadata = { title: "تسجيل الدخول — نظام إدارة بيانات القضايا والوثائق" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await isLoggedIn()) redirect("/");
  const { e } = await searchParams;

  return (
    <main className="login-page">
      <div className="login-card">
        <section className="login-brand">
          <div className="login-emblem">
            <Image src={logo} alt="شعار شرطة عمان السلطانية" priority />
          </div>
          <h2>شرطة عُمان السلطانية</h2>
          <p className="login-en">ROYAL OMAN POLICE</p>
          <div className="login-line" />
          <p className="login-system">نظام إدارة بيانات القضايا والوثائق</p>
        </section>

        <form className="login-form" action={login}>
          <h1>
            <Icon name="login" /> تسجيل الدخول
          </h1>
          <p className="muted">أدخل بياناتك للوصول إلى النظام</p>
          {e && (
            <p className="login-error" role="alert">
              اسم المستخدم أو كلمة المرور غير صحيحة
            </p>
          )}
          <label htmlFor="username">
            <Icon name="user" /> اسم المستخدم
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="أدخل اسم المستخدم"
          />
          <label htmlFor="password">
            <Icon name="lock" /> كلمة المرور
          </label>
          <PasswordField />
          <button type="submit" className="btn btn-primary login-submit">
            <Icon name="login" /> دخول إلى النظام
          </button>
        </form>
      </div>
    </main>
  );
}
