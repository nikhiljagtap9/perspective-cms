import { json } from "@remix-run/node";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// escape XML special chars
function escapeXml(unsafe: string = ""): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// convert Python JSON output → RSS XML
function jsonToXml(content: any): string {
  const channel = content.channel;
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<rss version="2.0"\n`;
  xml += `     xmlns:dc="http://purl.org/dc/elements/1.1/"\n`;
  xml += `     xmlns:media="http://search.yahoo.com/mrss/"\n`;
  xml += `     xmlns:ctv="http://example.com/ctv">\n`;
  xml += `  <channel>\n`;

  xml += `    <title>${escapeXml(channel.title)}</title>\n`;
  xml += `    <description>${escapeXml(channel.description)}</description>\n`;
  xml += `    <link>${escapeXml(channel.link ?? "")}</link>\n`;

  if (channel.image) {
    xml += `    <image>\n`;
    xml += `      <url>${escapeXml(channel.image.url)}</url>\n`;
    xml += `      <title>${escapeXml(channel.image.title)}</title>\n`;
    xml += `      <link>${escapeXml(channel.image.link)}</link>\n`;
    xml += `    </image>\n`;
  }

  for (const item of channel.items || []) {
    xml += `    <item>\n`;
    xml += `      <title>${escapeXml(item.title)}</title>\n`;
    xml += `      <description>${escapeXml(item.description)}</description>\n`;
    xml += `      <ctv:clip></ctv:clip>\n`;
    xml += `    </item>\n`;
  }

  xml += `  </channel>\n</rss>`;
  return xml;
}

export async function loader({ params }: { params: { id: string } }) {
  const countryId = params.id;
  if (!countryId) {
    return new Response("Missing countryId", { status: 400 });
  }

  try {
    // run Python script and capture stdout
    const { stdout } = await execFileAsync("./venv/bin/python", [
      "./scripts/daily_summary_single.py",
      "--id",
      countryId,
    ]);

    const parsed = JSON.parse(stdout.trim());
    const xml = jsonToXml(parsed);

    return new Response(xml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error: any) {
    console.error("Daily summary error:", error);
    return json(
      { error: error.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}
