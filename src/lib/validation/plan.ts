import { z } from "zod";

export const planSchema = z.object({
  name: z.string().trim().min(2, "Plan name is required").max(120),
  price: z.coerce.number().min(0, "Price cannot be negative"),
  period: z.enum(["daily", "weekly", "monthly", "yearly"]),
  min_quantity: z.coerce.number().int().min(1, "Minimum quantity must be at least 1"),
  available_from: z.string().date().nullable().optional(),
  available_to: z.string().date().nullable().optional(),
  tax_id: z.string().uuid().nullable().optional(),
  auto_close: z.boolean().default(false),
  closable: z.boolean().default(true),
  pausable: z.boolean().default(false),
  renewable: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.available_from && value.available_to && value.available_to < value.available_from) {
    context.addIssue({ code: "custom", path: ["available_to"], message: "Available-to date must be on or after available-from." });
  }
});
