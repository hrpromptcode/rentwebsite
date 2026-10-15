/**
 * Thai PromptPay QR (EMVCo merchant-presented) payload generator.
 * Supports phone numbers (0812345678), national/tax IDs (13 digits) and e-wallet IDs (15 digits).
 */

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizePromptpayId(id: string): { tag: "01" | "02" | "03"; value: string } {
  const digits = id.replace(/[^0-9]/g, "");
  if (digits.length === 13) return { tag: "02", value: digits };
  if (digits.length === 15) return { tag: "03", value: digits };
  // phone: 0812345678 → 0066812345678
  const phone = digits.startsWith("66") ? digits : `66${digits.replace(/^0/, "")}`;
  return { tag: "01", value: `00${phone}`.padStart(13, "0") };
}

/** @param amountSatang 0 = static QR (payer enters amount) */
export function promptpayPayload(promptpayId: string, amountSatang = 0): string {
  const target = normalizePromptpayId(promptpayId);
  const merchant = tlv("00", "A000000677010111") + tlv(target.tag, target.value);
  let payload =
    tlv("00", "01") + // payload format indicator
    tlv("01", amountSatang > 0 ? "12" : "11") + // dynamic / static
    tlv("29", merchant) +
    tlv("53", "764") + // THB
    (amountSatang > 0 ? tlv("54", (amountSatang / 100).toFixed(2)) : "") +
    tlv("58", "TH");
  payload += "6304";
  return payload + crc16(payload);
}

export async function promptpayQrSvg(payload: string): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 320 });
}

export async function promptpayQrDataUrl(payload: string): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 512 });
}
