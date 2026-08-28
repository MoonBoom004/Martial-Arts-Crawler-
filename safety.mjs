import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { safePublicUrl } from "./event-data.mjs";

export function isPublicAddress(address) {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127
    || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99)
    || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
}

export async function publicAddresses(hostname, resolver = lookup) {
  const records = await resolver(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error("Non-public network destination refused");
  return records;
}
export async function assertPublicHost(url) {
  if (!safePublicUrl(url)) throw new Error("Unsafe URL refused");
  await publicAddresses(new URL(url).hostname);
}

// Used for HTTP connections as well as preflight: redirects cannot resolve to
// metadata endpoints or local services. Browser hosts also need egress isolation.
export function safeLookup(hostname, options, callback) {
  publicAddresses(hostname).then(records => {
    const filtered = options?.family ? records.filter(record => record.family === options.family) : records;
    if (!filtered.length) throw new Error("No permitted network address");
    if (options?.all) callback(null, filtered);
    else callback(null, filtered[0].address, filtered[0].family);
  }).catch(error => callback(error));
}
