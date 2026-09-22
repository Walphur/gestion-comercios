import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { resolveProductImageUrl } from "../lib/productImages";

interface Props {
  imagePath?: string | null;
  /** Vista previa local (antes de guardar). */
  previewUrl?: string | null;
  alt?: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "card";
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-20 w-20",
  /** Llena el contenedor (carta gastronómica). */
  card: "h-full w-full",
};

export default function ProductThumb({
  imagePath,
  previewUrl,
  alt = "",
  className = "",
  size = "sm",
}: Props) {
  const [src, setSrc] = useState<string | null>(previewUrl ?? null);

  useEffect(() => {
    if (previewUrl) {
      setSrc(previewUrl);
      return;
    }
    let cancelled = false;
    if (!imagePath) {
      setSrc(null);
      return;
    }
    void resolveProductImageUrl(imagePath).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [imagePath, previewUrl]);

  const box = `${SIZE[size]} shrink-0 overflow-hidden bg-slate-100 ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700 ${
    size === "card" ? "rounded-none" : "rounded-lg"
  } ${className}`;

  if (!src) {
    return (
      <div className={`flex items-center justify-center text-ink-muted/50 ${box}`} aria-hidden>
        <ImageIcon size={size === "card" || size === "lg" ? 36 : 16} />
      </div>
    );
  }

  return <img src={src} alt={alt} className={`object-cover ${box}`} loading="lazy" />;
}
