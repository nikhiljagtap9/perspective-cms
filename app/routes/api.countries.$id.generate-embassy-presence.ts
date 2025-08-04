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
      embassyPresence: {
        select: {
          handle: true
        }
      }
    }
  });

  if (!country) {
    return json({ error: "Country not found" }, { status: 404 });
  }

  try {
    const existingHandle = country.embassyPresence[0]?.handle;
    const existingText = existingHandle ? `\nIMPORTANT: DO NOT return this existing handle we already track: ${existingHandle}` : '';

    const prompt = `You are a research assistant helping me gather data for an OSINT project focused on U.S. Embassy interests.

Task: For ${country.name}, please provide the official Twitter handle of the U.S. Embassy in ${country.name}, if it exists.${existingText}

Provide ONLY the Twitter handle with @ symbol, or "N/A" if not publicly available.
Do not include any additional text, explanation, or formatting.

Make sure the handle is valid and working. Include only the real, official U.S. Embassy account.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a research assistant helping to gather accurate information about U.S. diplomatic presence for embassy monitoring."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
    });

    const handle = completion.choices[0]?.message?.content?.trim();
    if (!handle || handle === 'N/A') {
      return json({ error: "No Twitter handle found for the U.S. Embassy" }, { status: 404 });
    }

    // Delete any existing embassy presence for this country
    await db.embassyPresence.deleteMany({
      where: { countryId: params.id }
    });

    // Create the new embassy presence
    await db.embassyPresence.create({
      data: {
        handle,
        country: {
          connect: { id: params.id }
        }
      }
    });

    return redirect(`/countries/${params.id}/embassy-presence`);
  } catch (error) {
    console.error('Error generating embassy presence:', error);
    return json({ error: "Failed to generate embassy presence" }, { status: 500 });
  }
} 