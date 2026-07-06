import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Fresh install: send the admin straight to the setup wizard.
  if ((await prisma.user.count()) === 0) redirect("/setup");
  if (await getUser()) redirect("/");
  return <LoginForm />;
}
