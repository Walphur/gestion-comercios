import { MessageCircle } from "lucide-react";
import { Button } from "./ui";
import { openSalesWhatsApp } from "../lib/supportContact";

interface Props {
  className?: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
}

export default function SalesWhatsAppButton({
  className = "",
  label = "Contratar plan mensual por WhatsApp",
  variant = "secondary",
}: Props) {
  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={() => void openSalesWhatsApp()}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1ebe57] ${className}`}
      >
        <MessageCircle size={18} />
        {label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={`w-full ${className}`}
      onClick={() => void openSalesWhatsApp()}
    >
      <MessageCircle size={16} className="text-[#25D366]" />
      {label}
    </Button>
  );
}
