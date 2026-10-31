import { z } from "zod";

export const paymentMethods = ["cash", "bank_transfer", "card", "upi", "cheque"] as const;

export const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  method: z.enum(paymentMethods),
  amount: z.coerce.number().finite().positive("Amount must be greater than zero."),
  paid_on: z.string().date(),
  note: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (value.paid_on > today) context.addIssue({ code: "custom", path: ["paid_on"], message: "Payment date cannot be in the future." });
});
