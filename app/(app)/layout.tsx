import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import Shortcuts from "@/components/Shortcuts";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar userName={user.name} />
      <Shortcuts />
      <main className="min-w-0 flex-1 p-3 md:p-4">{children}</main>
    </div>
  );
}
