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
      governmentMessaging: {
        select: {
          name: true,
          handle: true,
          notes: true
        }
      }
    }
  });

  if (!country) {
    return json({ error: "Country not found" }, { status: 404 });
  }

  try {
    const existingEntities = country.governmentMessaging.map(entity => 
      `- ${entity.name} (${entity.handle})`
    ).join('\n');

    const prompt = `You are a research assistant helping me gather data for an OSINT project focused on U.S. Embassy interests.

Task: Please provide the top 5 government entities in ${country.name} that regularly communicate via Twitter. These should include relevant ministries or agencies (e.g., Ministry of Foreign Affairs, Ministry of Defense, Prime Minister's Office, Presidential Office), etc.

IMPORTANT: DO NOT include any of these existing government entities we already track:
${existingEntities}

For each NEW entity, provide their information in exactly this format (including the blank line between each entity):

name: [Name of the entity in English, plus local if known]
handle: [Twitter handle with @ symbol]
notes: [One-sentence note describing their primary role or focus]

Example format:
name: Ministry of Foreign Affairs (Ministerio de Relaciones Exteriores)
handle: @CancilleriaAR
notes: Lead diplomatic body responsible for international relations and foreign policy implementation.

Do not include any markdown formatting, bullets, or additional text. Just provide the entities in the exact format shown above, with a blank line between each one.

Make sure all handles are valid and working. Include only real, existing government entities.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a research assistant helping to gather accurate information about government communication channels for diplomatic monitoring."
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

    // Parse the content into government messaging entities
    const entities = content.split('\n\n').map(block => {
      const lines = block.split('\n');
      const name = lines.find(l => l.startsWith('name:'))?.replace('name:', '').trim() || '';
      const handle = lines.find(l => l.startsWith('handle:'))?.replace('handle:', '').trim() || '';
      const notes = lines.find(l => l.startsWith('notes:'))?.replace('notes:', '').trim() || '';
      return { name, handle, notes };
    }).filter(entity => entity.name && entity.handle);

    // Create all government messaging entities
    await Promise.all(
      entities.map(entity =>
        db.governmentMessaging.create({
          data: {
            name: entity.name,
            handle: entity.handle,
            notes: entity.notes,
            countryId: params.id as string
          }
        })
      )
    );

    // Redirect back to the government messaging page to reload the list
    return redirect(`/countries/${params.id}/government-messaging`);
  } catch (error) {
    console.error('Error generating government messaging:', error);
    return json({ error: "Failed to generate government messaging" }, { status: 500 });
  }
} 