"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CREATE_IMAGE_UPLOAD, type ImageKind, type ImageUpload } from "@/lib/dashboard/queries";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, MAX_SOURCE_BYTES, imageFileProblem, percent, uploadSignErrorKey } from "@/lib/dashboard/upload";
import { shrinkImage } from "./shrinkImage";
import { toApiError } from "@/lib/graphql";
import { rateLimitMessage } from "@/lib/errors";
import { t, type Locale, type MessageKey } from "@/lib/i18n/dict";
import { Button } from "@/components/ui";

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

const MB = 1024 * 1024;

/**
 * Choose an image → check type/size → shrink a large photo (#212) → check the
 * result fits → get a presigned URL for that file → PUT with progress
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
  const [shrinking, setShrinking] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!chosen) return;
    const problem = imageFileProblem(chosen, MAX_SOURCE_BYTES);
    if (problem === "type") return setError({ key: "img.error.type" });
    if (problem) return setError({ key: "img.error.size", vars: { mb: MAX_SOURCE_BYTES / MB } });
    setError(null);
    setShrinking(true);
    const file = await shrinkImage(chosen).finally(() => setShrinking(false));
    // The API takes at most MAX_IMAGE_BYTES; a large file that couldn't shrink enough stops here.
    if (imageFileProblem(file)) return setError({ key: "img.error.tooBig", vars: { mb: MAX_IMAGE_BYTES / MB } });
    setProgress(0);
    let step: "sign" | "put" | "save" = "sign";
    try {
      // Signed for the file actually sent: its type and size may differ from the chosen one.
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
      else if (step === "sign") setError({ key: uploadSignErrorKey(e2.code) });
      else setError({ key: step === "put" ? "img.error.upload" : "img.error.save" });
    } finally {
      setProgress(null);
    }
  }

  const busy = shrinking || progress !== null;
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
      <Button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        variant="secondary"
      >
        {shrinking ? t(locale, "img.preparing") : busy ? t(locale, "img.uploading", { pct: progress ?? 0 }) : label}
      </Button>
      {progress !== null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress ?? 0}
          className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full bg-ink transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p className="mt-1 text-xs text-muted">{t(locale, "img.hint", { mb: MAX_SOURCE_BYTES / MB, px: MAX_IMAGE_SIDE })}</p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {t(locale, error.key, { mb: MAX_IMAGE_BYTES / MB, ...error.vars })}
        </p>
      )}
    </div>
  );
}
