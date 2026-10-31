import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { productSchema } from "@/lib/validation/product";

const authenticated = ["admin", "staff", "customer"] as const;

export const GET = withRole([...authenticated], async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,type,sales_price,cost_price,notes,tax_id,taxes(name,rate),product_variants(id,attribute,value,extra_price)")
    .order("name");
  if (error) return fail("INTERNAL", error.message, 500);
  return ok(data ?? []);
});

export const POST = withRole(["admin"], async (request) => {
  const parsed = await parseBody(request, productSchema);
  if (!parsed.success) return validationError(parsed.error);
  const { variants, ...product } = parsed.data;
  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase.from("products").select("id").eq("name", product.name).maybeSingle();
  if (lookupError) return fail("INTERNAL", lookupError.message, 500);
  if (existing) return fail("CONFLICT", "A product with this name already exists.", 409, { name: "Choose a unique product name." });

  const { data, error } = await supabase.from("products").insert(product).select("id").single();
  if (error || !data) return fail("INTERNAL", error?.message ?? "Could not create product.", 500);
  if (variants.length) {
    const { error: variantsError } = await supabase.from("product_variants").insert(variants.map((variant) => ({ ...variant, product_id: data.id })));
    if (variantsError) {
      await supabase.from("products").delete().eq("id", data.id);
      return fail("INTERNAL", variantsError.message, 500);
    }
  }
  return ok({ id: data.id }, { status: 201 });
});
