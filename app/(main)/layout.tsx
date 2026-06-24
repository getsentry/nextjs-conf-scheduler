import { AiAssistantSidebar } from "@/components/ai-assistant-sidebar";
import { Header } from "@/components/header";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <main className="min-w-0 flex-1">
          <div className="container py-8">{children}</div>
        </main>
        <AiAssistantSidebar />
      </div>
    </div>
  );
}
