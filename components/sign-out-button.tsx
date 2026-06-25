"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";

export function SignOutButton() {
  return (
    <form action={logout}>
      <SignOutSubmitButton />
    </form>
  );
}

function SignOutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button aria-busy={pending} disabled={pending} size="sm" type="submit" variant="outline">
      {pending ? "Signing out…" : "Sign Out"}
    </Button>
  );
}
