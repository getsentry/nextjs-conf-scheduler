import { getAiIdentity } from "@/lib/ai/identity";
import { getAiUsageSnapshot } from "@/lib/ai/usage";

export async function GET() {
  const identity = await getAiIdentity();
  const usage = await getAiUsageSnapshot(identity);

  return Response.json(usage);
}
