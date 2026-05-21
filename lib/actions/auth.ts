"use server";

import * as Sentry from "@sentry/nextjs";
import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function signup(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const startTime = Date.now();

  const result = await Sentry.withServerActionInstrumentation(
    "auth.signup",
    { headers: await headers() },
    async () => {
      const rawData = {
        name: formData.get("name") as string,
        email: formData.get("email") as string,
        password: formData.get("password") as string,
      };

      const validated = signupSchema.safeParse(rawData);

      if (!validated.success) {
        const failedFields = Object.keys(validated.error.flatten().fieldErrors);
        Sentry.logger.info("Signup validation failed", {
          action: "signup",
          email: rawData.email,
          failed_fields: failedFields.join(","),
          field_count: failedFields.length,
          duration_ms: Date.now() - startTime,
        });
        return {
          fieldErrors: validated.error.flatten().fieldErrors,
        };
      }

      const { name, email, password } = validated.data;

      const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (existingUser.length > 0) {
        Sentry.logger.info("Signup attempted with existing email", {
          action: "signup",
          result: "duplicate_email",
          email,
          duration_ms: Date.now() - startTime,
        });
        return { error: "An account with this email already exists" };
      }

      const hashedPassword = await hash(password, 10);
      const userId = crypto.randomUUID();

      await db.insert(users).values({
        id: userId,
        name,
        email,
        password: hashedPassword,
        createdAt: Date.now(),
      });

      await createSession(userId, email, name);

      Sentry.setUser({ id: userId, email, username: name });

      Sentry.logger.info("User signed up", {
        action: "signup",
        result: "success",
        user_id: userId,
        email,
        duration_ms: Date.now() - startTime,
      });

      return {};
    },
  );

  if (result.error || result.fieldErrors) {
    return result;
  }

  redirect("/");
}

export async function login(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const startTime = Date.now();

  const result = await Sentry.withServerActionInstrumentation(
    "auth.login",
    { headers: await headers() },
    async () => {
      const rawData = {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
      };

      const validated = loginSchema.safeParse(rawData);

      if (!validated.success) {
        Sentry.logger.info("Login validation failed", {
          action: "login",
          email: rawData.email,
          duration_ms: Date.now() - startTime,
        });
        return {
          fieldErrors: validated.error.flatten().fieldErrors,
        };
      }

      const { email, password } = validated.data;

      const found = await db.select().from(users).where(eq(users.email, email)).limit(1);

      const user = found[0];

      if (!user) {
        Sentry.logger.info("Login failed — user not found", {
          action: "login",
          result: "user_not_found",
          email,
          duration_ms: Date.now() - startTime,
        });
        return { error: "Invalid email or password" };
      }

      const passwordMatch = await compare(password, user.password);

      if (!passwordMatch) {
        Sentry.logger.info("Login failed — invalid password", {
          action: "login",
          result: "invalid_password",
          user_id: user.id,
          email,
          duration_ms: Date.now() - startTime,
        });
        return { error: "Invalid email or password" };
      }

      await createSession(user.id, user.email, user.name);

      Sentry.setUser({ id: user.id, email: user.email, username: user.name });

      Sentry.logger.info("User logged in", {
        action: "login",
        result: "success",
        user_id: user.id,
        email: user.email,
        duration_ms: Date.now() - startTime,
      });

      return {};
    },
  );

  if (result.error || result.fieldErrors) {
    return result;
  }

  redirect("/");
}

export async function logout() {
  const startTime = Date.now();

  await Sentry.withServerActionInstrumentation(
    "auth.logout",
    { headers: await headers() },
    async () => {
      await deleteSession();

      Sentry.setUser(null);

      Sentry.logger.info("User logged out", {
        action: "logout",
        duration_ms: Date.now() - startTime,
      });
    },
  );

  redirect("/login");
}
