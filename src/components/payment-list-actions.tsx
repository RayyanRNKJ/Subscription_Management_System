"use client";

import { useState } from "react";
import { PaymentDialog } from "@/components/payment-dialog";

export function PaymentListActions() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)} className="min-h-11 rounded-md bg-indigo-600 px-4 py-3 text-sm font-medium text-white">Record payment</button>{open && <PaymentDialog onClose={() => setOpen(false)} />}</>;
}
