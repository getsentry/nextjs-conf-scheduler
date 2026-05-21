"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function SentryUser({ user }: { user: { id: string; email: string; name: string } | null }) {
  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email, username: user.name });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  return null;
}
