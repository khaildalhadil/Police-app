import { redirect } from "next/navigation";
import CaseSystem from "@/components/case-system";
import { isLoggedIn } from "@/lib/auth";

export default async function Home() {
  if (!(await isLoggedIn())) redirect("/login");
  return <CaseSystem />;
}
