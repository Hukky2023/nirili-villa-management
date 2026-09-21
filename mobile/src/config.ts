export const HOTEL_SYSTEM_URL =
  process.env.EXPO_PUBLIC_HOTEL_SYSTEM_URL ??
  "https://nirili-villa.nirili-management.workers.dev";

export const HOTEL_SYSTEM_ORIGIN = new URL(HOTEL_SYSTEM_URL).origin;

export function isInternalUrl(url: string): boolean {
  if (
    url.startsWith("about:") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return true;
  }

  try {
    return new URL(url).origin === HOTEL_SYSTEM_ORIGIN;
  } catch {
    return false;
  }
}

export function isExternalAppUrl(url: string): boolean {
  return /^(tel:|mailto:|sms:|whatsapp:|geo:|maps:)/i.test(url);
}
