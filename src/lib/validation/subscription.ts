import { z } from "zod";

export const subscriptionLineSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().int().min(1),
  unit_price: z.coerce.number().min(0).optional(),
  tax_id: z.string().uuid().nullable().optional(),
});

export const subscriptionSchema = z.object({
  customer_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  start_date: z.string().date(),
  expiry_date: z.string().date().nullable().optional(),
  payment_terms: z.string().trim().max(100).nullable().optional(),
  lines: z.array(subscriptionLineSchema).min(1, "Add at least one subscription line."),
}).superRefine((value, context) => {
  if (value.expiry_date && value.expiry_date < value.start_date) {
    context.addIssue({ code: "custom", path: ["expiry_date"], message: "Expiry date must be on or after start date." });
  }
});

export const subscriptionPatchSchema = z.object({
  customer_id: z.string().uuid().optional(),
  plan_id: z.string().uuid().optional(),
  start_date: z.string().date().optional(),
  expiry_date: z.string().date().nullable().optional(),
  payment_terms: z.string().trim().max(100).nullable().optional(),
  lines: z.array(subscriptionLineSchema).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const transitionSchema = z.object({ to: z.enum(["draft", "quotation", "confirmed", "active", "closed"]) });
