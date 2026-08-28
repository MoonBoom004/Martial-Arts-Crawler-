import { load } from "cheerio";
import { cleanUrl, strip } from "./event-data.mjs";

export function snapshotHtml(html, url) {
  const $ = load(html), title = $("main h1,article h1,[role=main] h1,h1").first().text() || $("title").text();
  const root = $("main,article,[role=main]").first().length ? $("main,article,[role=main]").first() : $("body");
  const images = root.find("img").toArray().map(node => {
    const el = $(node);
    const srcset = (el.attr("data-srcset") || el.attr("srcset") || "").split(",").map(value => value.trim().split(/\s+/)[0]).filter(Boolean);
    return { src: el.attr("data-src") || el.attr("data-lazy-src") || srcset.at(-1) || el.attr("src"), alt: el.attr("alt") || "", width: Number(el.attr("width") || 0), height: Number(el.attr("height") || 0), context: strip(el.closest("figure,a,p").text()).slice(0,300) };
  });
  // Packets can live in the navigation outside <main>; discovery filters noise.
  const links = $("a[href]").toArray().map(node => ({ href: $(node).attr("href"), label: strip($(node).text()) || $(node).find("img").attr("alt") || "", rel: $(node).attr("rel") }));
  root.find("script,style,nav,header,footer,aside,[aria-hidden=true],.cookie-banner").remove();
  root.find("br").replaceWith("\n");
  root.find("p,div,h1,h2,h3,h4,li,tr,section").append("\n");
  const text = root.text().split("\n").map(line => line.replace(/[\t \u00a0]+/g," ").trim()).filter(Boolean).join("\n").slice(0,120000);
  return { url: cleanUrl(url), html, title: strip(title), text, links, images };
}
