"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CREATE_IMAGE_UPLOAD, type ImageKind, type ImageUpload } from "@/lib/dashboard/queries";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, imageFileProblem, percent } from "@/lib/dashboard/upload";
import { toApiError } from "@/lib/graphql";
import { rateLimitMessage } from "@/lib/errors";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";

/** PUT a file to a presigned URL, reporting progress (fetch can't report upload progress). */
function putFile(up: ImageUpload, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", up.uploadUrl);
    for (const h of up.headers) xhr.setRequestHeader(h.name, h.value);
    xhr.upload.onprogress = (e) => onProgress(percent(e.loaded, e.lengthComputable ? e.total : file.size));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("upload network error"));
    xhr.send(file);
  });
}

/**
 * Choose an image → check type/size → get a presigned URL → PUT with progress
 * → hand the public URL to `onUploaded` (which saves it). Used for the shop
 * logo / banner and the coffee gallery.
 */
export function ImageUploader({
  kind,
  targetId,
  locale,
  label,
  disabled,
  onUploaded,
}: {
  kind: ImageKind;
  targetId: string;
  locale: Locale;
  label: string;
  disabled?: boolean;
  onUploaded: (publicUrl: string) => Promise<void>;
}) {
  const { request } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<{ key: MessageKey; vars?: Record<string, number> } | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    const problem = imageFileProblem(file);
    if (problem) return setError({ key: problem === "type" ? "img.error.type" : "img.error.size" });
    setError(null);
    setProgress(0);
    let step: "sign" | "put" | "save" = "sign";
    try {
      const r = await request(CREATE_IMAGE_UPLOAD, {
        input: { kind, targetId, contentType: file.type.toLowerCase(), byteSize: file.size },
      });
      step = "put";
      await putFile(r.createImageUpload, file, setProgress);
      step = "save";
      await onUploaded(r.createImageUpload.publicUrl);
    } catch (err) {
      const e2 = toApiError(err);
      if (step === "sign" && e2.code === "RATE_LIMITED") setError(rateLimitMessage(e2.retryAfter));
      else if (step === "sign" && e2.code === "BAD_USER_INPUT") setError({ key: "img.error.unavailable" });
      else setError({ key: step === "put" ? "img.error.upload" : "img.error.save" });
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        onChange={(e) => void onChange(e)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:border-stone-500 disabled:opacity-40"
      >
        {busy ? t(locale, "img.uploading", { pct: progress ?? 0 }) : label}
      </button>
      {busy && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress ?? 0}
          className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-stone-200"
        >
          <div className="h-full bg-amber-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p className="mt-1 text-xs text-stone-500">{t(locale, "img.hint", { mb: MAX_IMAGE_BYTES / 1024 / 1024 })}</p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {t(locale, error.key, { mb: MAX_IMAGE_BYTES / 1024 / 1024, ...error.vars })}
        </p>
      )}
    </div>
  );
}
