import { z } from "zod";

const nullableId = z.string().uuid().nullable().optional();

export const productVariantSchema = z.object({
  id: z.string().uuid().optional(),
  attribute: z.string().trim().min(1, "Attribute is required").max(80),
  value: z.string().trim().min(1, "Value is required").max(120),
  extra_price: z.coerce.number().min(0, "Extra price cannot be negative"),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  type: z.string().trim().max(80).nullable().optional(),
  sales_price: z.coerce.number().min(0, "Sales price cannot be negative"),
  cost_price: z.coerce.number().min(0, "Cost price cannot be negative").nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  tax_id: nullableId,
  variants: z.array(productVariantSchema).default([]),
});
