// import { json } from "@remix-run/node";
// import type { LoaderFunctionArgs } from "@remix-run/node";
// import { db } from "~/lib/db.server";

// export async function loader({ params }: LoaderFunctionArgs) {
//   const { feed_id } = params;

//   if (!feed_id) {
//     return json({ error: "Feed ID is required" }, { status: 400 });
//   }

//   try {
//     const feed = await db.scrapperData.findUnique({
//       where: { id: Number(feed_id) },
//       select: {
//         id: true,
//         url: true,
//         feed_type: true,
//         content: true,
//         created_at: true,
//         updated_at: true,
//         Country: {
//           select: { id: true, name: true },
//         },
//       },
//     });

//     if (!feed) {
//       return json({ error: "Feed not found" }, { status: 404 });
//     }

//     return json({ feed });
//   } catch (error) {
//     console.error("Error fetching scrapper feed:", error);
//     return json(
//       { error: "Failed to fetch scrapper feed" },
//       { status: 500 }
//     );
//   }
// }

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

function jsonToXml(content: any): string {
  const channel = content.channel;
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0">\n  <channel>\n`;

  xml += `    <title>${channel.title}</title>\n`;
  xml += `    <description>${channel.description}</description>\n`;
  xml += `    <link>${channel.link}</link>\n`;
  xml += `    <lastBuildDate>${channel.lastBuildDate}</lastBuildDate>\n`;
  xml += `    <language>${channel.language}</language>\n`;

  if (channel.image) {
    xml += `    <image>\n`;
    xml += `      <url>${channel.image.url}</url>\n`;
    xml += `      <title>${channel.image.title}</title>\n`;
    xml += `      <link>${channel.image.link}</link>\n`;
    xml += `    </image>\n`;
  }

  for (const item of channel.items || []) {
    xml += `    <item>\n`;
    xml += `      <title>${item.title}</title>\n`;
    xml += `      <description>${item.description}</description>\n`;
    xml += `      <link>${item.link}</link>\n`;
    if (item.guid) {
      xml += `      <guid isPermaLink="${item.guid.isPermaLink}">${item.guid.value}</guid>\n`;
    }
    if (item["dc:creator"]) {
      xml += `      <dc:creator>${item["dc:creator"]}</dc:creator>\n`;
    }
    xml += `      <pubDate>${item.pubDate}</pubDate>\n`;
    if (item["media:content"]) {
      xml += `      <media:content url="${item["media:content"].url}" />\n`;
    }
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

    const xml = jsonToXml(parsed);

    return new Response(xml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("Error fetching scrapper feed:", error);
    return json({ error: "Failed to fetch scrapper feed" }, { status: 500 });
  }
}
