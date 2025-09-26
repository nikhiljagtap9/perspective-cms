// import { json } from "@remix-run/node";
// import type { LoaderFunctionArgs } from "@remix-run/node";
// import { db } from "~/lib/db.server";

// function jsonToXml(content: any): string {
//   const channel = content.channel;
//    let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
//   xml += `<rss version="2.0"\n`;
//   xml += `     xmlns:dc="http://purl.org/dc/elements/1.1/"\n`;
//   xml += `     xmlns:media="http://search.yahoo.com/mrss/">\n`;
//   xml += `  <channel>\n`;

//   xml += `    <title>${channel.title}</title>\n`;
//   xml += `    <description>${channel.description}</description>\n`;
//   xml += `    <link>${channel.link}</link>\n`;
//   xml += `    <lastBuildDate>${channel.lastBuildDate}</lastBuildDate>\n`;
//   xml += `    <language>${channel.language}</language>\n`;

//   if (channel.image) {
//     xml += `    <image>\n`;
//     xml += `      <url>${channel.image.url}</url>\n`;
//     xml += `      <title>${channel.image.title}</title>\n`;
//     xml += `      <link>${channel.image.link}</link>\n`;
//     xml += `    </image>\n`;
//   }

//   for (const item of channel.items || []) {
//     xml += `    <item>\n`;
//     xml += `      <title>${item.title}</title>\n`;
//     xml += `      <description>${item.description}</description>\n`;
//     xml += `      <link>${item.link}</link>\n`;
//     if (item.guid) {
//       xml += `      <guid isPermaLink="${item.guid.isPermaLink}">${item.guid.value}</guid>\n`;
//     }
//     if (item["dc:creator"]) {
//       xml += `      <dc:creator>${item["dc:creator"]}</dc:creator>\n`;
//     }
//     xml += `      <pubDate>${item.pubDate}</pubDate>\n`;
//     if (item["media:content"]) {
//       xml += `      <media:content url="${item["media:content"].url}" />\n`;
//     }
//     xml += `    </item>\n`;
//   }

//   xml += `  </channel>\n</rss>`;
//   return xml;
// }

// function escapeXml(unsafe: string = ""): string {
//   return unsafe
//     .replace(/&/g, "&amp;")
//     .replace(/</g, "&lt;")
//     .replace(/>/g, "&gt;")
//     .replace(/"/g, "&quot;")
//     .replace(/'/g, "&apos;");
// }

// function jsonToXml(content: any): string {
//   const channel = content.channel;
//   let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
//   xml += `<rss version="2.0"\n`;
//   xml += `     xmlns:dc="http://purl.org/dc/elements/1.1/"\n`;
//   xml += `     xmlns:media="http://search.yahoo.com/mrss/">\n`;
//   xml += `  <channel>\n`;

//   xml += `    <title>${escapeXml(channel.title)}</title>\n`;
//   xml += `    <description>${escapeXml(channel.description)}</description>\n`;
//   xml += `    <link>${escapeXml(channel.link)}</link>\n`;
//   if (channel.lastBuildDate) {
//     xml += `    <lastBuildDate>${escapeXml(channel.lastBuildDate)}</lastBuildDate>\n`;
//   }
//   if (channel.language) {
//     xml += `    <language>${escapeXml(channel.language)}</language>\n`;
//   }

//   if (channel.image) {
//     xml += `    <image>\n`;
//     xml += `      <url>${escapeXml(channel.image.url)}</url>\n`;
//     xml += `      <title>${escapeXml(channel.image.title)}</title>\n`;
//     xml += `      <link>${escapeXml(channel.image.link)}</link>\n`;
//     xml += `    </image>\n`;
//   }

//   for (const item of channel.items || []) {
//     xml += `    <item>\n`;
//     xml += `      <title>${escapeXml(item.title)}</title>\n`;
//     xml += `      <description>${escapeXml(item.description)}</description>\n`;
//     if (item.link) {
//       xml += `      <link>${escapeXml(item.link)}</link>\n`;
//     }
//     if (item.guid) {
//       xml += `      <guid isPermaLink="${item.guid.isPermaLink}">${escapeXml(
//         item.guid.value
//       )}</guid>\n`;
//     }
//     if (item["dc:creator"]) {
//       xml += `      <dc:creator>${escapeXml(item["dc:creator"])}</dc:creator>\n`;
//     }
//     if (item.pubDate) {
//       xml += `      <pubDate>${escapeXml(item.pubDate)}</pubDate>\n`;
//     }
//     if (item["media:content"]) {
//       xml += `      <media:content url="${escapeXml(
//         item["media:content"].url
//       )}" />\n`;
//     }
//     xml += `    </item>\n`;
//   }

//   xml += `  </channel>\n</rss>`;
//   return xml;
// }



// export async function loader({ params }: LoaderFunctionArgs) {
//   const { feed_id } = params;

//   if (!feed_id) {
//     return json({ error: "Feed ID is required" }, { status: 400 });
//   }

//   try {
//     const feed = await db.scrapperData.findUnique({
//       where: { id: Number(feed_id) },
//       select: { content: true },
//     });

//     if (!feed) {
//       return json({ error: "Feed not found" }, { status: 404 });
//     }

//     let parsed: any;
//     try {
//       parsed = JSON.parse(feed.content);
//     } catch {
//       return json({ error: "Invalid feed content (not JSON)" }, { status: 500 });
//     }

//     const xml = jsonToXml(parsed);

//     return new Response(xml, {
//       headers: { "Content-Type": "application/xml" },
//     });
//   } catch (error) {
//     console.error("Error fetching scrapper feed:", error);
//     return json({ error: "Failed to fetch scrapper feed" }, { status: 500 });
//   }
// }



import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

/**
 * Escape unsafe XML characters like &, <, >, ", '
 */
function escapeXml(unsafe: string = ""): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function jsonToXml(content: any): string {
  const channel = content.channel;

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<rss version="2.0"\n`;
  xml += `     xmlns:dc="http://purl.org/dc/elements/1.1/"\n`;
  xml += `     xmlns:media="http://search.yahoo.com/mrss/"\n`;
  xml += `     xmlns:ctv="http://example.com/ctv">\n`;
  xml += `  <channel>\n`;

  // channel metadata
  xml += `    <title>${escapeXml(channel.title)}</title>\n`;
  xml += `    <description>${escapeXml(channel.description)}</description>\n`;
  xml += `    <link>${escapeXml(channel.link ?? "")}</link>\n`;

  if (channel.lastBuildDate) {
    xml += `    <lastBuildDate>${channel.lastBuildDate}</lastBuildDate>\n`;
  }
  if (channel.language) {
    xml += `    <language>${channel.language}</language>\n`;
  }

  if (channel.image) {
    xml += `    <image>\n`;
    xml += `      <url>${escapeXml(channel.image.url)}</url>\n`;
    xml += `      <title>${escapeXml(channel.image.title)}</title>\n`;
    xml += `      <link>${escapeXml(channel.image.link)}</link>\n`;
    xml += `    </image>\n`;
  }

  // items loop
  for (const item of channel.items || []) {
    xml += `    <item>\n`;
    xml += `      <title>${escapeXml(item.title)}</title>\n`;
    xml += `      <description>${escapeXml(item.description)}</description>\n`;
    if (item.link) {
      xml += `      <link>${escapeXml(item.link)}</link>\n`;
    }
    if (item.guid) {
      xml += `      <guid isPermaLink="${item.guid.isPermaLink}">${escapeXml(item.guid.value)}</guid>\n`;
    }
    if (item.pubDate) {
      xml += `      <pubDate>${item.pubDate}</pubDate>\n`;
    }

    // extra <ctv:clip> section
    xml += `      <ctv:clip>\n`;
    if (item["dc:creator"]) {
      xml += `        <ctv:handle>${escapeXml(item["dc:creator"])}</ctv:handle>\n`;
    }
    if (item.thumbnails) {
      const thumbs = Array.isArray(item.thumbnails) ? item.thumbnails : [item.thumbnails];
      for (const thumb of thumbs) {
        xml += `        <ctv:thumbnails>${escapeXml(thumb)}</ctv:thumbnails>\n`;
      }
    }
    if (item.sentiment) {
      xml += `        <ctv:sentiment>${escapeXml(item.sentiment)}</ctv:sentiment>\n`;
    }
    if (item.language) {
      xml += `        <ctv:language>${escapeXml(item.language)}</ctv:language>\n`;
    }
    xml += `      </ctv:clip>\n`;

    xml += `    </item>\n`;
  }

  xml += `  </channel>\n</rss>`;
  return xml;
}



export async function loader({ params }: LoaderFunctionArgs) {
  const { feed_id } = params;

  if (!feed_id) {
    return json({ error: "Feed ID is required" }, { status: 400 });
  }

  try {
    const feed = await db.scrapperData.findUnique({
      where: { id: Number(feed_id) },
      select: { content: true },
    });

    if (!feed) {
      return json({ error: "Feed not found" }, { status: 404 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(feed.content);
    } catch {
      return json({ error: "Invalid feed content (not JSON)" }, { status: 500 });
    }

    // ✅ decide when to escape:
    // Example: check channel title OR use a flag in your DB
    const isDailySummary = parsed.channel?.title?.toLowerCase().includes("daily summary");

    const xml = jsonToXml(parsed, isDailySummary);

    return new Response(xml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("Error fetching scrapper feed:", error);
    return json({ error: "Failed to fetch scrapper feed" }, { status: 500 });
  }
}
