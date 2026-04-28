import { HttpErrorResponse } from '@angular/common/http';

export function readHttpErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallbackMessage;
  }

  const apiMessage = readString(error.error?.message);
  if (apiMessage) {
    return apiMessage;
  }

  const firstDetail = Array.isArray(error.error?.details)
    ? error.error.details.find((detail: unknown) => typeof detail === 'string' && detail.trim().length > 0)
    : null;
  if (typeof firstDetail === 'string') {
    return firstDetail.trim();
  }

  return fallbackMessage;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
