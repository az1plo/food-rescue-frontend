export interface DraftDetectedItem {
  name: string;
  quantity: number;
}

export function parseBusinessOfferDetectedItemLabel(value: string): DraftDetectedItem {
  const normalizedValue = value.trim();
  const trailingCountMatch = normalizedValue.match(/^(.+?)\s*(?:x|\u00D7)\s*(\d{1,2})$/i);
  if (trailingCountMatch) {
    return {
      name: trailingCountMatch[1].trim(),
      quantity: normalizeBusinessOfferDetectedItemQuantity(Number.parseInt(trailingCountMatch[2], 10)),
    };
  }

  const leadingCountMatch = normalizedValue.match(/^(\d{1,2})\s*(?:x|\u00D7)\s*(.+)$/i);
  if (leadingCountMatch) {
    return {
      name: leadingCountMatch[2].trim(),
      quantity: normalizeBusinessOfferDetectedItemQuantity(Number.parseInt(leadingCountMatch[1], 10)),
    };
  }

  return {
    name: normalizedValue,
    quantity: 1,
  };
}

export function normalizeBusinessOfferDetectedItemQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity < 1) {
    return 1;
  }

  return Math.min(99, Math.trunc(quantity));
}

export function formatBusinessOfferDetectedItemLabel(name: string, quantity: number): string {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return '';
  }

  return quantity > 1 ? `${normalizedName} x${quantity}` : normalizedName;
}
