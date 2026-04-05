"use client";

import { useState } from "react";
import { Phone, MessageCircle, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ContactButtonsProps {
  contactName?: string;
  phoneNumber?: string;
}

export function ContactButtons({ contactName, phoneNumber }: ContactButtonsProps) {
  const [showInput, setShowInput] = useState(false);
  const [number, setNumber] = useState(phoneNumber || "");

  const cleanNumber = (n: string) => {
    let cleaned = n.replace(/\s/g, "").replace(/[^0-9+]/g, "");
    if (cleaned.startsWith("0")) cleaned = "+41" + cleaned.slice(1);
    if (!cleaned.startsWith("+")) cleaned = "+41" + cleaned;
    return cleaned;
  };

  const handleCall = () => {
    if (!number) { setShowInput(true); return; }
    window.location.href = `tel:${cleanNumber(number)}`;
  };

  const handleWhatsApp = () => {
    if (!number) { setShowInput(true); return; }
    const clean = cleanNumber(number);
    window.open(`https://wa.me/${clean.replace("+", "")}`, "_blank");
  };

  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={handleCall}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-95 transition-all text-sm font-medium"
        >
          <Phone className="w-4 h-4" />
          Appeler
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 active:scale-95 transition-all text-sm font-medium"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </button>
      </div>

      {showInput && !phoneNumber && (
        <div className="mt-2 flex gap-2">
          <Input
            type="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="N° de téléphone du client"
            className="h-9 text-sm"
          />
          <button
            onClick={() => setShowInput(false)}
            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {contactName && (
        <p className="text-[10px] text-gray-400 mt-1 text-center">{contactName}</p>
      )}
    </div>
  );
}
