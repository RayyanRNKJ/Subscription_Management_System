import { z } from "zod";
import { passwordSchema } from "@/lib/validation";

export const customerSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the customer name").max(120),
  company: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
});
