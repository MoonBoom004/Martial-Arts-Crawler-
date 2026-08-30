import { cleanUrl, EVENT_WORDS, isSupportUrl, NON_EVENT_WORDS, sportFor, SPORTS, STATE_GROUPS, STATE_NAMES, strip } from "./event-data.mjs";

// Sources, not a hard-coded list of competition records. Dates/details are read afresh.
export function officialDirectories(year) {
  const aau = "https://www.aausports.org/taekwondo/";
  return [
    { url: "https://www.usatkd.org/calendar", sport: "taekwondo" },
    { url: "https://www.usatkd.org/v2-events/state-championships", sport: "taekwondo" },
    { url: "https://atamartialarts.com/events/event-schedule/", sport: "taekwondo" },
    { url: "https://www.ataezsignup.com/tournaments/", sport: "taekwondo" },
    { url: "https://itf-tkd.org/events/", sport: "taekwondo" },
    { url: aau, sport: "taekwondo" },
    ...[year - 1, year].map(start => ({ url: `${aau}${start}-${String(start + 1).slice(-2)}-season-licensed-events/`, sport: "taekwondo" })),
    { url: "https://www.aausports.org/event-finder/?sp=TW", sport: "taekwondo" },
    { url: "https://ncsports.org/state-games/", sport: null, region: 0 },
    { url: "https://stategames.org/", sport: null },
    { url: "https://www.kihapp.com/arts/2-taekwondo/tournaments", sport: "taekwondo" },
    { url: "https://www.usankf.org/calendar", sport: "karate" },
    { url: "https://www.usankf.org/navigation/events/us-senior-team-trials", sport: "karate" },
    { url: "https://www.usankf.org/sanctioned-events", sport: "karate" },
    { url: "https://ibjjf.com/events/calendar", sport: "brazilian_jiu_jitsu" },
    { url: "https://www.nagafighter.com/events/", sport: "brazilian_jiu_jitsu" },
    { url: "https://grapplingindustries.com/events/", sport: "brazilian_jiu_jitsu" },
    { url: "https://grapplingindustries.smoothcomp.com/en/federation/23/events/upcoming", sport: "brazilian_jiu_jitsu" },
    { url: "https://www.usajudo.com/events/calendar", sport: "judo" },
    { url: "https://www.usajudo.com/athletes/seniors/selection-procedures", sport: "judo" },
    { url: "https://usajudo.smoothcomp.com/en/federation/129/events/upcoming", sport: "judo" },
    { url: "https://www.usja.net/events", sport: "judo" },
    { url: "https://usawrestlingevents.com/events", sport: "wrestling" },
    { url: "https://usawrestlingevents.com/national_regional", sport: "wrestling" },
    { url: `https://naska.com/${year}-calendar/`, sport: "karate" },
    { url: "https://usmuaythaiopen.com/", sport: "muay_thai_kickboxing" },
    { url: "https://usamuaythai.sport/", sport: "muay_thai_kickboxing" },
    { url: "https://www.ikffightsports.com/ikfkickboxingmuaythai", sport: "muay_thai_kickboxing" },
    { url: "https://wakousa.org/events/", sport: "muay_thai_kickboxing" },
  ];
}

export const isDocumentUrl = url => /\.(?:pdf|png|jpe?g|webp|tiff?)(?:\?|$)/i.test(url);
export const isDirectoryUrl = url => /\/(?:calendar(?:-old)?|events|tournaments|upcoming|past|state-games|event-finder|state-championships|[^/]*licensed-events)\/?(?:\?.*)?$/i.test(url);
const excludedLink = /volunteer|sponsor|donat|referee.*application|login|privacy|merchandise|shop|contact us|arm[ _-]?wrestling|professional wrestling|\bwwe\b/i;

/** @param {{href:string,label?:string,alt?:string,rel?:string}[]} links @param {string} base @param {{kind?:string,sport?:string|null,title?:string,depth?:number}} [options] */
export function discoverPageLinks(links, base, { kind = "event", sport = null, title = "", depth = 0 } = {}) {
  const found = new Map();
  for (const link of links) {
    const url = cleanUrl(link.href, base), label = strip(link.label || link.alt || "");
    if (!url || url === cleanUrl(base) || isSupportUrl(url) || excludedLink.test(label + " " + url)) continue;
    const sameHost = new URL(url).hostname === new URL(base).hostname;
    const explicitSport = sportFor(label, url), inheritedSport = explicitSport || sport;
    const next = link.rel === "next" || /^(?:next(?: page)?|older(?: events)?|previous(?: events)?)\s*[»›→]?$/i.test(label);
    const directory = isDirectoryUrl(url) || /^(?:event calendar|calendar|all sports|sports|licensed events|upcoming events|past events|member states)$/i.test(label);
    const eventPath = /\/(?:events?|tournaments?)\/[^/?#]+|\/20\d{2}[^/]*(?:championship|open|tournament)|\/sg_[^/]+\/(?:details|register)/i.test(url);
    let targetKind;
    if (isDocumentUrl(url) && (kind !== "directory" || inheritedSport) && /flyer|poster|packet|handbook|prospectus|\.pdf(?:\?|$)/i.test(label + " " + url)) targetKind = "document";
    else if (kind === "directory" && next && sameHost) targetKind = "directory";
    else if (directory && depth < 3 && (sameHost || /state games/i.test(title + " " + label))) targetKind = "directory";
    else if (kind === "directory" && explicitSport && !NON_EVENT_WORDS.test(label)) targetKind = directory ? "directory" : "event";
    else if (inheritedSport && (EVENT_WORDS.test(label + " " + url) || eventPath) && !NON_EVENT_WORDS.test(label)) targetKind = directory ? "directory" : "event";
    else if (kind === "event" && depth < 3 && /^(?:register(?: now| here)?|event details|official website|competition website|tournament information|information packet|event packet)$/i.test(label)) targetKind = isDocumentUrl(url) ? "document" : "event";
    else if (kind === "directory" && depth < 2 && /state games/i.test(title) && /games|sports/i.test(label)) targetKind = "directory";
    if (targetKind) found.set(url, { url, title: label, kind: targetKind, inheritedSport, contextTitle: kind === "directory" && EVENT_WORDS.test(title) ? title : "", depth: depth + 1 });
  }
  return [...found.values()];
}

export function searchQueries(region, now, windowKey) {
  const year = now.getFullYear() + (windowKey % 4 === 3 ? -1 : windowKey % 4 === 2 ? 1 : 0);
  return SPORTS.flatMap(sport => [
    ...STATE_GROUPS[region].flatMap(code => [
      `(${sport.query}) (tournament OR championship OR "state games") "${STATE_NAMES[code]}" ${year}`,
      `(${sport.query}) (flyer OR poster OR packet) "${STATE_NAMES[code]}" ${year}`,
    ]),
    ...["smoothcomp.com", "kihapp.com", "fitofan.ai", "mataction.com", "eventbrite.com", "facebook.com/events"].map(host => `site:${host} (${sport.query}) competition United States ${year}`),
    `(${sport.query}) ("sports complex" OR "sports commission" OR "state games") ${year}`,
  ].map(query => ({ query, sport: sport.key })));
}
