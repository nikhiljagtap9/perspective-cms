import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";
import { openai } from "~/lib/openai.server";
import { requireAuth } from "~/lib/require-auth.server";

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAuth(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const country = await db.country.findUnique({
    where: { id: params.id },
    select: { 
      name: true,
      newsSources: {
        select: {
          name: true,
          url: true,
          notes: true
        }
      }
    }
  });

  if (!country) {
    return json({ error: "Country not found" }, { status: 404 });
  }

  try {
    const existingSources = country.newsSources.map(source => 
      `- ${source.name} (${source.url})`
    ).join('\n');

    const prompt = `List at 3 popular or influential news websites that cover political, economic affairs, and social issues in ${country.name}.
Include URL and, if known, any relevant notes (e.g., whether they are state-owned, independent, or private).

IMPORTANT: DO NOT include any of these existing news sources we already track:
${existingSources}

For each NEW source, provide their information in exactly this format (including the blank line between each source):

name: [name]
notes: [notes]
url: [url]

Example format:
name: The New York Times
notes: State-owned
url: https://www.nytimes.com

Do not include any markdown formatting, bullets, or additional text. Just provide the news sources in the exact format shown above, with a blank line between each one.

Make sure all URLs are valid and working. Include only real, existing news sources.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that provides accurate information about news sources in different countries."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("No content generated");

    // Parse the content into news sources
    const sources = content.split('\n\n').map(block => {
      const lines = block.split('\n');
      const name = lines.find(l => l.startsWith('name:'))?.replace('name:', '').trim() || '';
      const notes = lines.find(l => l.startsWith('notes:'))?.replace('notes:', '').trim() || '';
      const url = lines.find(l => l.startsWith('url:'))?.replace('url:', '').trim() || '';
      return { name, notes, url };
    }).filter(source => source.name && source.url);

    // Create all news sources
    await Promise.all(
      sources.map(source =>
        db.newsSource.create({
          data: {
            name: source.name,
            notes: source.notes,
            url: source.url,
            countryId: params.id as string
          }
        })
      )
    );

    // Redirect back to the news sources page to reload the list
    return redirect(`/countries/${params.id}/news-sources`);
  } catch (error) {
    console.error('Error generating news sources:', error);
    return json({ error: "Failed to generate news sources" }, { status: 500 });
  }
} 