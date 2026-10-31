import { z } from "zod";

function todayInIndia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export const billingRunSchema = z.object({ run_date: z.string().date().optional() }).superRefine((value, context) => {
  if (!value.run_date) return;
  const max = new Date(`${todayInIndia()}T00:00:00Z`);
  max.setUTCFullYear(max.getUTCFullYear() + 1);
  if (value.run_date > max.toISOString().slice(0, 10)) {
    context.addIssue({ code: "custom", path: ["run_date"], message: "Run date cannot be more than one year in the future." });
  }
});

export const confirmDraftsSchema = z.object({
  subscription_ids: z.array(z.string().uuid()).nullable().optional(),
});
