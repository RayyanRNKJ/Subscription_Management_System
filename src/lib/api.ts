import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, type Profile, type Role } from "@/lib/auth";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "PLAN_UNAVAILABLE"
  | "INVOICE_NOT_PAYABLE"
  | "OVERPAYMENT"
  | "CONFLICT"
  | "INTERNAL";

type ErrorFields = Record<string, string>;

/** Return the API's consistent successful response envelope. */
export function ok<T>(data: T, init: ResponseInit = {}) {
  return NextResponse.json({ data }, init);
}

/** Return the API's consistent error response envelope. */
export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  fields?: ErrorFields,
) {
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

/** Convert Zod's path-aware issues into the field map used by form clients. */
export function validationError(error: z.ZodError) {
  const fields: ErrorFields = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";
    fields[field] ??= issue.message;
  }
  return fail("VALIDATION_ERROR", "Please correct the highlighted fields.", 422, fields);
}

/** Safely read and validate a JSON request body with a shared Zod schema. */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T) {
  const body = await request.json().catch(() => null);
  return schema.safeParse(body);
}

type RoleHandler = (request: Request, profile: Profile) => Promise<Response> | Response;

/**
 * Applies the common authentication and role gate to mutating route handlers.
 * Database RLS remains the second authorization boundary for the operation itself.
 */
export function withRole(roles: Role[], handler: RoleHandler) {
  return async (request: Request) => {
    const profile = await getProfile();
    if (!profile) return fail("UNAUTHENTICATED", "Sign in to continue.", 401);
    if (!roles.includes(profile.role)) return fail("FORBIDDEN", "You do not have permission for this action.", 403);

    try {
      return await handler(request, profile);
    } catch (error) {
      console.error("Unhandled API error", error);
      return fail("INTERNAL", "Something went wrong. Please try again.", 500);
    }
  };
}
