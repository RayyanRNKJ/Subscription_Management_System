import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { productSchema } from "@/lib/validation/product";

type Context = { params: Promise<{ id: string }> };

export const GET = withRole(["admin", "staff", "customer"], async (_request, _profile, context) => {
  const { id } = await (context as Context).params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,type,sales_price,cost_price,notes,tax_id,taxes(name,rate),product_variants(id,attribute,value,extra_price)")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("INTERNAL", error.message, 500);
  if (!data) return fail("NOT_FOUND", "Product not found.", 404);
  return ok(data);
});

export const PATCH = withRole(["admin"], async (request, _profile, context) => {
  const { id } = await (context as Context).params;
  const parsed = await parseBody(request, productSchema);
  if (!parsed.success) return validationError(parsed.error);
  const { variants, ...product } = parsed.data;
  const supabase = await createClient();
  const { data: duplicate, error: lookupError } = await supabase.from("products").select("id").eq("name", product.name).neq("id", id).maybeSingle();
  if (lookupError) return fail("INTERNAL", lookupError.message, 500);
  if (duplicate) return fail("CONFLICT", "A product with this name already exists.", 409, { name: "Choose a unique product name." });
  const { data, error } = await supabase.from("products").update(product).eq("id", id).select("id").maybeSingle();
  if (error) return fail("INTERNAL", error.message, 500);
  if (!data) return fail("NOT_FOUND", "Product not found.", 404);

  // Variant rows are small and are deliberately replaced as one server-side operation.
  const { error: deleteError } = await supabase.from("product_variants").delete().eq("product_id", id);
  if (deleteError) return fail("INTERNAL", deleteError.message, 500);
  if (variants.length) {
    const { error: variantsError } = await supabase.from("product_variants").insert(variants.map((variant) => ({ ...variant, product_id: id })));
    if (variantsError) return fail("INTERNAL", variantsError.message, 500);
  }
  return ok({ id });
});

export const DELETE = withRole(["admin"], async (_request, _profile, context) => {
  const { id } = await (context as Context).params;
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return fail(error.code === "23503" ? "CONFLICT" : "INTERNAL", error.code === "23503" ? "This product is referenced and cannot be deleted." : error.message, error.code === "23503" ? 409 : 500);
  return ok({ id });
});
