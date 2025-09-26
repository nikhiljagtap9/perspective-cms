import { json } from "@remix-run/node";
import { spawn } from "node:child_process";

// ✅ loader for GET requests (Postman GET will now work)
export async function loader({ params }: { params: { id?: string } }) {
  const countryId = params.id; 

  if (!countryId) {
    return json({ error: "Missing countryId" }, { status: 400 });
  }

  return runPython(countryId);
}

// ✅ action for POST requests
export async function action({ params }: { params: { id?: string } }) {
  const countryId = params.id;

  if (!countryId) {
    return new Response("Missing countryId", { status: 400 });
  }

  return runPython(countryId);
}

// 🔧 shared function to call your Python script
// helper to escape XML
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

export async function runPython(countryId: string) {
  const scriptPath = "./scripts/daily_summary_single.py";

  try {
    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn("./venv/bin/python", [scriptPath, "--id", String(countryId)], {
        cwd: process.cwd(),
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });
    });

    // ✅ Parse JSON output from Python and convert to XML
    const parsed = JSON.parse(result);
    const xml = jsonToXml(parsed);

    return new Response(xml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error: any) {
    return json({ error: error.message || "Failed to generate summary" }, { status: 500 });
  }
}
