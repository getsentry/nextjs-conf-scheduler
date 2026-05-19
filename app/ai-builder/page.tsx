import { Suspense } from "react";
import { Header } from "@/components/header";
import { requireAuth } from "@/lib/auth/dal";
import { AIChat } from "./ai-chat";

export default function AIBuilderPage() {
  return (
    <Suspense>
      <AIBuilderContent />
    </Suspense>
  );
}

async function AIBuilderContent() {
  await requireAuth();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">AI Schedule Builder</h1>
            <p className="text-muted-foreground">
              Tell me about your interests and I'll help you build the perfect conference schedule.
            </p>
          </div>

          <AIChat />
        </div>
      </main>
    </div>
  );
}
