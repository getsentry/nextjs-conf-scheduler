import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { decrypt } from "./session";

export const verifySession = cache(async () => {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const payload = await decrypt(session);

  if (!payload?.userId) {
    return { isAuth: false, userId: null };
  }

  return { isAuth: true, userId: payload.userId };
});

export const getUser = cache(async () => {
  const session = await verifySession();

  if (!session.isAuth || !session.userId) {
    return null;
  }

  const result = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return result[0] ?? null;
});

export async function requireAuth(): Promise<{ isAuth: true; userId: string }> {
  const session = await verifySession();

  if (!session.isAuth || !session.userId) {
    redirect("/login");
  }

  return { isAuth: true, userId: session.userId };
}
