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
      influencers: {
        select: {
          name: true,
          handle: true,
          url: true
        }
      }
    }
  });

  if (!country) {
    return json({ error: "Country not found" }, { status: 404 });
  }

  try {
    const existingInfluencers = country.influencers.map(inf => 
      `- ${inf.name} (${inf.handle}) - ${inf.url}`
    ).join('\n');

    const prompt = `
    I'm gathering information on ${country.name} to assist U.S. Embassy personnel with daily OSINT monitoring. Please provide the following data in English:
    
List 3 key influencers (journalists, political figures, activists, analysts) who discuss political, economic, or social issues in ${country.name}.

IMPORTANT: DO NOT include any of these existing influencers we already track:
${existingInfluencers}

For each NEW influencer, provide their information in exactly this format (including the blank line between each influencer):

name: [full name]
handle: [twitter handle with @ symbol]
role: [their role/affiliation]
political leaning: [number between -3 and 3]
url: [twitter profile URL]

Example format:
name: John Smith
handle: @johnsmith
role: Political Analyst at XYZ Institute
political leaning: -1
url: https://twitter.com/johnsmith

Do not include any markdown formatting, bullets, or additional text. Just provide the influencers in the exact format shown above, with a blank line between each one.

Make sure all URLs are valid and working. Include only real, existing influencers with significant following.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a research assistant helping to populate a spreadsheet of information for an OSINT aggregator focused on U.S. Embassy interests worldwide."
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

    console.log('Raw content from OpenAI:', content);

    // Parse the content into influencers
    const influencers = content.split('\n\n').map(block => {
      console.log('Processing block:', block);
      const lines = block.split('\n');
      const name = lines.find(l => l.startsWith('name:'))?.replace('name:', '').trim() || '';
      const handle = lines.find(l => l.startsWith('handle:'))?.replace('handle:', '').trim() || '';
      const role = lines.find(l => l.startsWith('role:'))?.replace('role:', '').trim() || '';
      const politicalLeaning = lines.find(l => l.startsWith('political leaning:'))?.replace('political leaning:', '').trim() || '0';
      const url = lines.find(l => l.startsWith('url:'))?.replace('url:', '').trim() || '';
      
      const influencer = { 
        name, 
        handle, 
        role, 
        politicalLeaning: parseFloat(politicalLeaning), 
        url 
      };
      console.log('Parsed influencer:', influencer);
      return influencer;
    }).filter(influencer => {
      const isValid = influencer.name && 
        influencer.handle && 
        influencer.role && 
        !isNaN(influencer.politicalLeaning) && 
        influencer.url;
      if (!isValid) {
        console.log('Filtered out invalid influencer:', influencer);
      }
      return isValid;
    });

    console.log('Final influencers to create:', influencers);

    // Create all influencers
    try {
      const createdInfluencers = await Promise.all(
        influencers.map(influencer =>
          db.influencer.create({
            data: {
              name: influencer.name,
              handle: influencer.handle,
              role: influencer.role,
              politicalLeaning: influencer.politicalLeaning,
              url: influencer.url,
              countryId: params.id as string
            }
          })
        )
      );
      console.log('Successfully created influencers:', createdInfluencers);
    } catch (error) {
      console.error('Error creating influencers:', error);
      throw error;
    }

    // Redirect back to the influencers page to reload the list
    return redirect(`/countries/${params.id}/influencers`);
  } catch (error) {
    console.error('Error generating influencers:', error);
    return json({ error: "Failed to generate influencers" }, { status: 500 });
  }
} 