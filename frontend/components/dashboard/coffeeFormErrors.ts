import type { useFormErrors } from "@/components/ui";
import type { CoffeeField, VariantField } from "@/lib/dashboard/coffeeFields";

/** Every field a coffee form can show a problem under: its details fields and the option rows' controls. */
export type CoffeeFieldKey = CoffeeField | VariantField;

/** What `useFormErrors<CoffeeFieldKey>(...)` returns, passed to the field components. */
export type CoffeeFormErrors = ReturnType<typeof useFormErrors<CoffeeFieldKey>>;
