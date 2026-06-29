"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AuthState, signup } from "@/lib/actions/auth";
import { conferenceConfig } from "@/lib/conference-config";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signup, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!state.resetFields) return;

    const resetFields = new Set(state.resetFields);
    if (resetFields.has("name")) setName("");
    if (resetFields.has("email")) setEmail("");
    if (resetFields.has("password")) setPassword("");
  }, [state.resetFields]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Create an account</CardTitle>
        <CardDescription>Join {conferenceConfig.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
              aria-invalid={!!state.fieldErrors?.name}
              autoComplete="name"
              id="name"
              name="name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              required
              type="text"
              value={name}
            />
            {state.fieldErrors?.name && (
              <p className="text-xs text-destructive" id="name-error">
                {state.fieldErrors.name[0]}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
              aria-invalid={!!state.fieldErrors?.email}
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            {state.fieldErrors?.email && (
              <p className="text-xs text-destructive" id="email-error">
                {state.fieldErrors.email[0]}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              aria-describedby={state.fieldErrors?.password ? "password-error" : "password-hint"}
              aria-invalid={!!state.fieldErrors?.password}
              autoComplete="new-password"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
            {state.fieldErrors?.password ? (
              <p className="text-xs text-destructive" id="password-error">
                {state.fieldErrors.password[0]}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground" id="password-hint">
                At least 8 characters.
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
