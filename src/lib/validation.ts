import { z } from "zod";

// Brief: MORE than 8 chars, upper, lower, special.
export const passwordSchema = z
  .string()
  .min(9, "Password must be more than 8 characters")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[^A-Za-z0-9]/, "Password needs a special character");

const email = z.string().trim().toLowerCase().email("Enter a valid email");

export const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name"),
  company: z.string().trim().optional(),
  email,
  password: passwordSchema,
});
export const staffSchema = signUpSchema.omit({ company: true });
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password") });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ password: passwordSchema });
