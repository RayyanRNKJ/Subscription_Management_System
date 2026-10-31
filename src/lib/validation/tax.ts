import { z } from "zod";

export const taxSchema = z.object({
  name: z.string().trim().min(1, "Tax name is required").max(120),
  rate: z.coerce.number().min(0, "Rate cannot be negative").max(100, "Rate cannot exceed 100%"),
});
