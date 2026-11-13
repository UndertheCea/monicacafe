"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fieldDomId,
  firstInvalid,
  noErrors,
  scrollBehavior,
  type FieldMessage,
  type FormErrors,
} from "@/lib/formErrors";
import type { ControlProps } from "./Field";

/**
 * Per-field errors for one form (#232). `order` is the fields in visual order. After `fail(...)`, focus moves to
 * the first field with a problem (or to the summary when only the form has one) and it scrolls into view.
 */
export function useFormErrors<F extends string, K extends string = string>(formId: string, order: readonly F[]) {
  const [errors, setErrors] = useState<FormErrors<F, K>>(noErrors);
  const focusPending = useRef(false);

  const fail = useCallback((next: FormErrors<F, K>) => {
    focusPending.current = true;
    setErrors(next);
  }, []);

  /** Shortcut for one problem under one field. */
  const failField = useCallback(
    (field: F, message: FieldMessage<K>) => fail({ fields: { [field]: message } as FormErrors<F, K>["fields"] }),
    [fail],
  );

  const clear = useCallback(() => setErrors(noErrors()), []);

  /** Clear one field's error, e.g. when the person edits it. */
  const clearField = useCallback(
    (field: F) =>
      setErrors((e) => (e.fields[field] ? { ...e, fields: { ...e.fields, [field]: undefined } } : e)),
    [],
  );

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    const first = firstInvalid(order, errors);
    const el = document.getElementById(first ? fieldDomId(formId, first) : `${formId}-summary`);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollIntoView({ block: "center", behavior: scrollBehavior(reduce) });
    el.focus({ preventScroll: true });
  }, [errors, formId, order]);

  /** id / aria-describedby / aria-invalid for a control that isn't wrapped in `<Field>`. */
  const control = useCallback(
    (field: F): ControlProps => {
      const id = fieldDomId(formId, field);
      return errors.fields[field] ? { id, "aria-describedby": `${id}-error`, "aria-invalid": true } : { id };
    },
    [errors, formId],
  );

  return {
    errors,
    fail,
    failField,
    clear,
    clearField,
    control,
    /** The DOM id of a field, for `<Field id>`. */
    id: (field: F) => fieldDomId(formId, field),
    first: firstInvalid(order, errors),
  };
}
