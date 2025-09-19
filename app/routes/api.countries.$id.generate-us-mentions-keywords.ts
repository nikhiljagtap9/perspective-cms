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
      usMentionsKeywords: {
        select: {
          keyword: true
        }
      }
    }
  });

  if (!country) {
    return json({ error: "Country not found" }, { status: 404 });
  }

  try {
    const existingKeywords = country.usMentionsKeywords.map(k => 
      `- ${k.keyword}`
    ).join('\n');

    const prompt = `List at least 3 keywords or phrases an American ambassador in ${country.name} would be especially interested in monitoring.
Focus on political, security, economic, or cultural terms that might affect bilateral relations or U.S. interests.
Include any local-language terms if relevant (with brief translations).

IMPORTANT: DO NOT include any of these existing keywords we already track:
${existingKeywords}

Format each NEW keyword on a new line, without numbers or bullets. Keep each keyword/topic concise (1-3 words).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that provides relevant keywords for diplomatic monitoring."
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

    // Parse the content into usMentionsKeywords
    const usMentionsKeywords = content.split('\n')
      .map(line => line.trim())
      .filter(keyword => keyword.length > 0);

    // Create all usMentionsKeywords
    await Promise.all(
      usMentionsKeywords.map(keyword =>
        db.usMentionsKeyword.create({
          data: {
            keyword,
            countryId: params.id as string
          }
        })
      )
    );

    // Redirect back to the us-mentions Keywords page to reload the list
    return redirect(`/countries/${params.id}/us-mentions-keywords`);
  } catch (error) {
    console.error('Error generating us-mentions keywords:', error);
    return json({ error: "Failed to generate us-mentions keywords" }, { status: 500 });
  }
} 