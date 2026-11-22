// Copyright QubeTX — tikset.com

export function previewHeaders(target, trustedOrigin, cookie) {
  if (!cookie || !trustedOrigin || target.protocol !== "https:") return {};

  const trusted = new URL(trustedOrigin);
  if (trusted.protocol !== "https:" || trusted.href !== trusted.origin + "/") {
    throw new Error("TIKSET_PREVIEW_ORIGIN must be an HTTPS origin.");
  }
  return target.origin === trusted.origin ? { Cookie: cookie } : {};
}
