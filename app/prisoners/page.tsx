import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrisonersRegister } from "@/components/registers";
import { isLoggedIn } from "@/lib/auth";

export const metadata: Metadata = { title: "السجناء — نظام إدارة بيانات القضايا والوثائق" };

export default async function Prisoners() {
  if (!(await isLoggedIn())) redirect("/login");
  return <PrisonersRegister />;
}
