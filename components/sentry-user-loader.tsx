import { getUser } from "@/lib/auth/dal";
import { SentryUser } from "./sentry-user";

export async function SentryUserLoader() {
  const user = await getUser();
  return <SentryUser user={user} />;
}
