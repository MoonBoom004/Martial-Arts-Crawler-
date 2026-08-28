// Pure extraction rules shared by the worker and the receiver's validation tests.
export const SPORTS = [
  { key: "taekwondo", query: "taekwondo", pattern: /tae\s*kwon\s*do|\btkd\b|poomsae|kyorugi|kukkiwon|usatkd/i },
  { key: "karate", query: "karate", pattern: /\bkarate\b|\bkumite\b|\bkata\b|naska/i },
  { key: "brazilian_jiu_jitsu", query: '"jiu jitsu"', pattern: /\bbjj\b|jiu[ -]?jitsu|ibjjf|grappling|nagafighter/i },
  { key: "judo", query: "judo", pattern: /\bjudo\b|\bshiai\b|\busja\b|\busjf\b/i },
  { key: "muay_thai_kickboxing", query: '"muay thai" OR kickboxing', pattern: /muay thai|kickboxing|wako|usmto|ikf/i },
  { key: "wrestling", query: "wrestling", pattern: /\bwrestling\b|folkstyle|greco[ -]?roman|trackwrestling/i },
];
export const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
export const STATE_GROUPS = [
  ["NC", "SC", "VA", "GA", "FL", "TN", "KY", "AL", "MS", "LA"],
  ["NY", "NJ", "PA", "MA", "CT", "MD", "DE", "DC", "RI", "NH", "ME"],
  ["OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "KS", "NE", "WV", "VT"],
  ["TX", "OK", "AR", "NM", "AZ", "CO", "UT", "NV", "WY", "MT", "ND", "SD"],
  ["CA", "OR", "WA", "ID", "AK", "HI"],
];
export const EVENT_WORDS = /\b(?:open|cup|classic|games|festival|nationals?|championships?|tournaments?|qualifier|trials|rumble|invitational|grand prix|challenge|shiai|meet)\b/i;
export const NON_EVENT_WORDS = /\b(?:results?|recap|seminar|clinic|camp|course|webinar|meeting|workshop|photo gallery|arm[ -]?wrestling|professional wrestling|wwe)\b/i;
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const MONTH_NUMBERS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const SOCIAL_HOSTS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|youtube\.com|reddit\.com)$/i;
const DOMAIN_SPORTS = [
  [/^(?:.+\.)?(?:usatkd\.org|aautkd\.org|aautaekwondo\.org|taekwondo\.tv)$/, "taekwondo"],
  [/^(?:.+\.)?(?:usajudo\.com|usja\.net|usjf\.com)$/, "judo"],
  [/^usajudo\.smoothcomp\.com$/, "judo"],
  [/^(?:.+\.)?(?:usawrestlingevents\.com|trackwrestling\.com|usawrestling\.org)$/, "wrestling"],
  [/^(?:.+\.)?(?:usmuaythaiopen\.com|ikffightsports\.com|wakousa\.org)$/, "muay_thai_kickboxing"],
  [/^(?:.+\.)?(?:ibjjf\.com|nagafighter\.com|grapplingindustries\.com)$/, "brazilian_jiu_jitsu"],
  [/^grapplingindustries\.smoothcomp\.com$/, "brazilian_jiu_jitsu"],
  [/^(?:.+\.)?(?:naska\.com|usankf\.org)$/, "karate"],
];

/** @param {unknown} value */
export function safePublicUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/\.$/, "");
    // Event sources use named hosts. Refuse all IP literals and local names,
    // including URL-normalized hexadecimal/octal IPv4 and IPv6 addresses.
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      && (!url.port || url.port === "80" || url.port === "443")
      && host.includes(".") && !/[\[\]:]/.test(host) && !/^\d+(?:\.\d+){3}$/.test(host)
      && !/(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host);
  } catch { return false; }
}

/** @param {unknown} value @param {string|undefined} [base] */
export function cleanUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    if (!safePublicUrl(url.href)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString(); // Paths and query values can be case-sensitive.
  } catch { return null; }
}

/** @param {string} url */
export function isSocialUrl(url) { try { return SOCIAL_HOSTS.test(new URL(url).hostname); } catch { return false; } }
/** @param {string} url */
export function isSupportUrl(url) { try { return /\/(?:privacy|terms|login|signin|author|membership|photos-video|results?)(?:\/|$)/i.test(new URL(url).pathname); } catch { return true; } }
/** @param {string} value */
export function strip(value = "") { return String(value).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim(); }
/** @param {string} value */
export function canonical(value = "") { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

/** @param {number} year @param {number} month @param {number} day */
function calendarDate(year, month, day) {
  if (year < 2000 || year > 2099) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
/** Parse only dates with an explicit year, month and day; retain the event's local date. @param {unknown} value */
export function isoDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1");
  let match = text.match(/^(20\d{2})-(\d{2})-(\d{2})(?:$|T\d{2}:\d{2})/);
  if (match) return calendarDate(+match[1], +match[2], +match[3]);
  match = text.match(new RegExp(`^(${MONTHS})\\.?\\s+(\\d{1,2}),?\\s+(20\\d{2})$`, "i"));
  if (match) return calendarDate(+match[3], MONTH_NUMBERS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, +match[2]);
  match = text.match(new RegExp(`^(\\d{1,2})\\s+(${MONTHS})\\.?\\s+(20\\d{2})$`, "i"));
  if (match) return calendarDate(+match[3], MONTH_NUMBERS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, +match[1]);
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})$/);
  return match ? calendarDate(+match[3], +match[1], +match[2]) : null;
}
/** @param {string} text */
export function textDates(text) {
  const raw = text.replace(/\u00a0/g, " ").split(/\n/).map(line => line.trim()).filter(Boolean), lines = [], found = [];
  const explicitYears = [...new Set(raw.slice(0, 12).filter(line => /^20\d{2}$/.test(line) || EVENT_WORDS.test(line) && !/deadline|registration|copyright/i.test(line)).flatMap(line => [...line.matchAll(/\b20\d{2}\b/g)].map(match => match[0])))];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (new RegExp(`^(?:${MONTHS})\\.?$`, "i").test(line) && /^\d{1,2}(?:st|nd|rd|th)?(?:\s*[–—-]\s*\d{1,2})?,?$/.test(raw[i + 1] || "")) line += " " + raw[++i];
    if (new RegExp(`(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*[–—-]\\s*\\d{1,2})?,?$`, "i").test(line)) {
      if (/^20\d{2}$/.test(raw[i + 1] || "")) line += " " + raw[++i];
      else if (explicitYears.length === 1) line += " " + explicitYears[0];
    }
    lines.push(line);
  }
  const label = /(?:event|competition|tournament)\s+dates?\s*[:–—-]?|^(?:date|when)\s*[:–—-]?/i;
  const ignore = /registration|deadline|early bird|entry clos|copyright|updated|published|hotel|weigh.?in|check.?in/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ignore.test(line) || i > 0 && ignore.test(lines[i - 1]) && /[:–—-]\s*$/.test(lines[i - 1])) continue;
    const labeled = label.test(line) || label.test(lines[i - 1] || "");
    // Ordinary prose, large poster dates, and date rows all work. Footer dates do not.
    if (!labeled && i > 35) continue;
    const value = line.replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/gi, "");
    const range = value.match(new RegExp(`(${MONTHS})\\.?\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?\\s*(?:[–—-]|to|through)\\s*(?:(${MONTHS})\\.?\\s+)?(\\d{1,2}),?\\s+(20\\d{2})`, "i"));
    let dates;
    if (range) {
      const startDate = isoDate(`${range[1]} ${range[2]}, ${range[3] || range[6]}`), endDate = isoDate(`${range[4] || range[1]} ${range[5]}, ${range[6]}`);
      if (startDate && endDate && endDate >= startDate) dates = { startDate, endDate };
    } else {
      const matches = [...value.matchAll(new RegExp(`20\\d{2}-\\d{2}-\\d{2}|(?:${MONTHS})\\.?\\s+\\d{1,2},?\\s+20\\d{2}|\\d{1,2}\\s+(?:${MONTHS})\\.?\\s+20\\d{2}|\\d{1,2}/\\d{1,2}/20\\d{2}`, "gi"))].map(match => isoDate(match[0])).filter(Boolean);
      if (matches.length === 1) dates = { startDate: matches[0], endDate: matches[0] };
      else if (matches.length === 2 && /[–—-]|\bto\b/i.test(value) && matches[1] >= matches[0]) dates = { startDate: matches[0], endDate: matches[1] };
    }
    if (dates) found.push({ ...dates, labeled });
  }
  const preferred = found.some(item => item.labeled) ? found.filter(item => item.labeled) : found;
  const unique = [...new Map(preferred.map(({ startDate, endDate }) => [`${startDate}:${endDate}`, { startDate, endDate }])).values()];
  return unique.length === 1 ? unique[0] : null; // Conflicting editions remain a lead.
}

export function textLocation(text) {
  const lines = text.replace(/\u00a0/g, " ").split(/\n/).map(line => line.trim()).filter(Boolean);
  const stateNames = [...Object.values(STATE_NAMES), ...Object.keys(STATE_NAMES)].sort((a, b) => b.length - a.length).join("|");
  const candidates = [];
  for (let i = 0; i < Math.min(lines.length, 120); i++) {
    const line = lines[i], context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
    if (/contact|mailing address|national (?:office|headquarters)|copyright/i.test(context)) continue;
    const inline = line.match(/^(\d{1,6}\s+.{2,100}?\b(?:street|st|road|rd|avenue|ave|drive|dr|boulevard|blvd|way|lane|ln|parkway|pkwy|highway|hwy|court|ct)\.?)\s+(.+,\s*[A-Za-z].*)$/i);
    const match = (inline?.[2] || line).match(new RegExp(`(?:^|[|;]|Location:|Venue:)\\s*([A-Za-z][A-Za-z .'-]{1,60}),\\s*(${stateNames})(?:\\s+(\\d{5}(?:-\\d{4})?))?(?=$|[\\s,|])`, "i"));
    if (!match) continue;
    const city = match[1].trim(), state = normalizeState(match[2]);
    const street = inline?.[1] || (/^\d{1,6}\s+.{2,100}\b(?:street|st|road|rd|avenue|ave|drive|dr|boulevard|blvd|way|lane|ln|parkway|pkwy|highway|hwy|court|ct)\b/i.test(lines[i - 1] || "") ? lines[i - 1] : undefined);
    const venueLine = lines[i - (inline ? 1 : 2)] || "";
    const venue = street && !/^(?:where|location|venue)\s*:?$/i.test(venueLine) ? venueLine : undefined;
    candidates.push({ city, state, venue, address: street ? [street, city, state, match[3]].filter(Boolean).join(", ") : undefined });
  }
  const unique = [...new Map(candidates.sort((a,b) => Number(Boolean(a.address)) - Number(Boolean(b.address))).map(item => [`${canonical(item.city)}:${item.state}`, item])).values()];
  return unique.length === 1 ? unique[0] : {};
}

export function competitionTitle(title, text, contextTitle = "") {
  const clean = strip(title).split(/\s+\|\s+/)[0].trim();
  if (EVENT_WORDS.test(clean) && !NON_EVENT_WORDS.test(clean)) return clean;
  const lines = text.split(/\n/).map(value => strip(value)).filter(Boolean).slice(0, 16);
  const at = lines.findIndex(value => value.length > 8 && value.length < 150 && EVENT_WORDS.test(value) && !NON_EVENT_WORDS.test(value) && !/registration|deadline|copyright|rules|handbook/i.test(value) && sportFor(value, ""));
  if (at >= 0) return (at > 0 && /state games|national games/i.test(lines[at - 1]) ? `${lines[at - 1]} — ${lines[at]}` : lines[at]).slice(0, 240);
  if (sportFor(clean, "") && !NON_EVENT_WORDS.test(clean) && EVENT_WORDS.test(contextTitle)) return `${strip(contextTitle)} — ${clean}`.slice(0, 240);
  if (sportFor(clean, "") && /\b(?:tournament|competition)\b/i.test(text)) return `${clean} Tournament`;
  return clean;
}
/** @param {unknown} value */
export function normalizeState(value) {
  if (typeof value !== "string") return undefined;
  const input = value.trim().toLowerCase();
  return Object.entries(STATE_NAMES).find(([code, name]) => code.toLowerCase() === input || name.toLowerCase() === input)?.[0];
}
/** @param {unknown} country @param {unknown} state */
export function confirmedUnitedStates(country, state) {
  if (typeof country === "string" && country.trim()) return /^(?:US|USA|U\.S\.?A?\.?|United States(?: of America)?)$/i.test(country.trim());
  return Boolean(normalizeState(state));
}
/** @param {string} title @param {string} url @param {string} [text] */
export function sportFor(title, url, text = "") {
  if (/arm[ _-]?wrestling|professional wrestling|\bwwe\b/i.test(title + " " + url)) return null;
  let host = ""; try { host = new URL(url).hostname.toLowerCase(); } catch {}
  const known = DOMAIN_SPORTS.find(([pattern]) => pattern instanceof RegExp && pattern.test(host));
  if (known) return String(known[1]);
  for (const value of [title, text]) {
    const matches = SPORTS.filter(sport => sport.pattern.test(value));
    if (matches.length === 1) return matches[0].key;
    // Conflicting sports on multisport directories are discovery leads, not a guess.
    if (matches.length > 1) return null;
  }
  return null;
}
/** @param {string} title */
export function levelFor(title) {
  if (/international|world|pan american/i.test(title)) return "international";
  if (/national|team trials/i.test(title)) return "national";
  if (/regional|region \d/i.test(title)) return "regional";
  if (/state|district/i.test(title)) return "state";
  return "local";
}
/** @param {string} html */
export function jsonEvents(html) {
  const found = [];
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const types = [].concat(value["@type"] || []);
    if (types.some(type => /^(?:https?:\/\/schema\.org\/)?(?:Event|SportsEvent)$/.test(type))) found.push(value);
    // USA Taekwondo's public calendar embeds event rows in application/json.
    // Read the data, never execute scripts or assume a US location from the federation.
    if (typeof value.title === "string" && value.url && value.event_options?.start_date) {
      const options = value.event_options, location = options.location || {};
      found.push({ "@type": "SportsEvent", name: value.title, url: value.url, startDate: options.start_date, endDate: options.end_date, description: options.event_type,
        location: { address: { addressLocality: location.city, addressRegion: location.state, addressCountry: location.country } } });
    }
    Object.values(value).forEach(visit);
  };
  for (const match of html.matchAll(/<script[^>]*type\s*=\s*["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Other blocks can still be usable. */ }
  }
  return [...new Map(found.map(item => [`${item.name}:${item.startDate}:${item.url || ""}`, item])).values()];
}

/** @param {{ url: string, html: string, title: string, text: string, links: {href: string, label: string}[], ogImage?: string|null, allowFallback?: boolean, contextTitle?: string }} page */
export function extractPageEvents(page) {
  const structuredEvents = jsonEvents(page.html), events = [], reasons = new Set();
  for (const structured of structuredEvents.length ? structuredEvents : page.allowFallback === false ? [] : [{}]) {
    const title = competitionTitle(typeof structured.name === "string" ? structured.name : page.title, page.text, page.contextTitle).slice(0, 240);
    if (!title || !EVENT_WORDS.test(title) || NON_EVENT_WORDS.test(title) || /^(?:20\d{2} )?(?:events?|tournaments?|competitions?|calendar|events? calendar|schedule)$/i.test(title)) { reasons.add("Page is not a specific competition"); continue; }
    const fallbackDates = structuredEvents.length > 1 ? null : textDates(page.text), startDate = isoDate(structured.startDate) || fallbackDates?.startDate, endDate = isoDate(structured.endDate) || (structured.startDate ? startDate : fallbackDates?.endDate) || startDate;
    if (!startDate || !endDate || endDate < startDate) { reasons.add("Competition date needs confirmation"); continue; }
    const sport = sportFor(title, page.url, strip(structured.description || "") || page.text.slice(0, 6000));
    if (!sport) { reasons.add("Martial art needs confirmation"); continue; }
    const location = Array.isArray(structured.location) ? structured.location[0] || {} : structured.location || {};
    const address = location.address || {}, countryValue = address.addressCountry;
    const country = typeof countryValue === "string" ? countryValue : countryValue?.name || countryValue?.identifier;
    const place = textLocation(page.text + "\n" + page.title);
    const state = normalizeState(address.addressRegion) || place.state, city = typeof address.addressLocality === "string" ? address.addressLocality : place.city;
    if (!confirmedUnitedStates(country, state)) { reasons.add("A United States location needs confirmation"); continue; }
    const exactAddress = typeof address.streetAddress === "string" && city ? [address.streetAddress, city, state, address.postalCode].filter(Boolean).join(", ") : place.address;
    const links = page.links.map(link => ({ href: cleanUrl(link.href, page.url), label: strip(link.label).slice(0, 300) })).filter(link => link.href);
    const documents = links.filter(link => /flyer|poster|packet|prospectus|rules|\.pdf(?:\?|$)/i.test(`${link.label} ${link.href}`)).slice(0, 20).map(link => ({ url: link.href, documentType: /flyer|poster/i.test(link.label) ? "flyer" : /rules/i.test(link.label) ? "rules" : /packet|prospectus/i.test(link.label) ? "event_packet" : "other", title: link.label || "Competition document", mediaType: /\.pdf(?:\?|$)/i.test(link.href) ? "application/pdf" : undefined }));
    const registration = links.find(link => /\bregister(?: now| here)?\b|competition registration|event registration/i.test(link.label));
    const flyer = documents.find(doc => doc.documentType === "flyer" && /\.(?:png|jpg|jpeg|webp)(?:\?|$)/i.test(doc.url));
    const organizer = Array.isArray(structured.organizer) ? structured.organizer[0] || {} : structured.organizer || {};
    const eligibility = /(?:by )?invitation[ -]only/i.test(page.text) ? "invitation_only" : /\bin[ -]house\b|\bschool members only\b/i.test(page.text) ? "in_house" : "unclear";
    const sanctionText = page.text.match(/(?:sanctioned|recognized)\s+by\s*:?\s*([^\n.]{2,160})/i)?.[1] || "";
    const sanctioningBodies = ["USA Taekwondo", "USATKD", "AAU", "World Taekwondo", "IBJJF", "USA Judo", "USA Wrestling", "NASKA", "WAKO"].filter(name => new RegExp(`\\b${name}\\b`, "i").test(sanctionText));
    events.push({ sourceUrl: cleanUrl(structured.url, page.url) || page.url, title, martialArt: sport, startDate, endDate, level: levelFor(title), venue: typeof location.name === "string" ? location.name.slice(0, 240) : place.venue?.slice(0, 240), city: city?.slice(0, 120), state, country: "United States", address: exactAddress?.slice(0, 320), registrationUrl: registration?.href, flyerUrl: flyer?.url, hostName: typeof organizer.name === "string" ? organizer.name.slice(0, 240) : undefined, hostUrl: cleanUrl(organizer.url, page.url) || undefined, sanctioningBodies, categories: [], eligibility, locationConfidence: exactAddress ? 0.98 : state ? 0.86 : 0, flyerConfidence: flyer ? 0.95 : 0, membershipConfidence: 0, deadlineConfidence: 0, evidence: [{ field: "title", value: title, sourceUrl: page.url, confidence: structured.name ? 0.98 : 0.88 }, { field: "start_date", value: startDate, sourceUrl: page.url, confidence: structured.startDate ? 0.98 : 0.88 }, { field: "country", value: "United States", sourceUrl: page.url, confidence: country ? 0.98 : 0.86 }], documents });
  }
  return { events, reason: events.length ? null : [...reasons].join("; ") || "Directory or page needs an event-specific link" };
}
