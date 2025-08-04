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
      leadershipMessaging: {
        select: {
          name: true,
          title: true,
          handle: true
        }
      }
    }
  });

  if (!country) {
    return json({ error: "Country not found" }, { status: 404 });
  }

  try {
    const existingLeaders = country.leadershipMessaging.map(leader => 
      `- ${leader.name} (${leader.title}) - ${leader.handle}`
    ).join('\n');

    const prompt = `You are a research assistant helping me gather data for an OSINT project focused on U.S. Embassy interests.

Task: Please provide the top 5 individual government leaders or figures of power in ${country.name} who have an active presence on Twitter. Examples include the President, Prime Minister, key ministers (e.g., Foreign Minister), monarchs, or other high-level officials.

IMPORTANT: DO NOT include any of these existing leaders we already track:
${existingLeaders}

For each NEW leader, provide their information in exactly this format (including the blank line between each leader):

name: [Full Name]
title: [Official Title]
handle: [Twitter handle with @ symbol]
political_leaning: [Brief note on political or ideological leaning, if publicly known (if uncertain, state "Unknown")]

Example format:
name: John Smith
title: Minister of Foreign Affairs
handle: @JohnSmith
political_leaning: Center-right, pro-Western

Do not include any markdown formatting, bullets, or additional text. Just provide the leaders in the exact format shown above, with a blank line between each one.

Make sure all handles are valid and working. Include only real, existing government leaders.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a research assistant helping to gather accurate information about government leadership for diplomatic monitoring."
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

    // Parse the content into leadership entities
    const leaders = content.split('\n\n').map(block => {
      const lines = block.split('\n');
      const name = lines.find(l => l.startsWith('name:'))?.replace('name:', '').trim() || '';
      const title = lines.find(l => l.startsWith('title:'))?.replace('title:', '').trim() || '';
      const handle = lines.find(l => l.startsWith('handle:'))?.replace('handle:', '').trim() || '';
      const politicalLeaning = lines.find(l => l.startsWith('political_leaning:'))?.replace('political_leaning:', '').trim() || '';
      return { name, title, handle, politicalLeaning };
    }).filter(leader => leader.name && leader.title && leader.handle);

    // Create all leadership entities
    await Promise.all(
      leaders.map(leader =>
        db.leadershipMessaging.create({
          data: {
            name: leader.name,
            title: leader.title,
            handle: leader.handle,
            politicalLeaning: leader.politicalLeaning,
            countryId: params.id as string
          }
        })
      )
    );

    // Redirect back to the leadership messaging page to reload the list
    return redirect(`/countries/${params.id}/leadership-messaging`);
  } catch (error) {
    console.error('Error generating leadership messaging:', error);
    return json({ error: "Failed to generate leadership messaging" }, { status: 500 });
  }
} 