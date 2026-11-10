import { useEffect, useState } from "react";

/** Debajo del breakpoint `md` de Tailwind (768px): celular o tablet chica en vertical. */
const QUERY = "(max-width: 767.98px)";

function matches(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(matches);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(QUERY);
    const onChange = () => setMobile(media.matches);
    onChange();
    // Safari 13 y anteriores solo tienen addListener.
    if (media.addEventListener) media.addEventListener("change", onChange);
    else media.addListener(onChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", onChange);
      else media.removeListener(onChange);
    };
  }, []);

  return mobile;
}
