import type { MessageKey } from "@/lib/i18n/dict";
import type { VariantProblem } from "@/lib/dashboard/validate";

export const VARIANT_PROBLEM_KEY: Record<VariantProblem, MessageKey> = {
  weight: "cf.error.weight",
  price: "cf.error.price",
  stock: "cf.error.stock",
  duplicate: "cf.error.duplicate",
};
