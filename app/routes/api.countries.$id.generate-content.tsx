import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { startContentGeneration, getGenerationStatus, type SectionKey } from "~/lib/openai.server";
import { db } from "~/lib/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const generationId = url.searchParams.get('generationId');
  const { id } = params;

  try {
    // If a specific generationId is provided, return its status
    if (generationId) {
      const status = await getGenerationStatus(generationId);
      
      // If the status is COMPLETED, we should save it and update the status
      if (status.status === 'COMPLETED') {
        const generation = await db.contentGeneration.findUnique({
          where: { id: generationId },
          select: {
            countryName: true,
            section: true,
            content: true
          }
        });

        if (generation && generation.content) {
          // Find the country by name
          const country = await db.country.findFirst({
            where: { name: generation.countryName }
          });

          if (country) {
            // Update the country with the generated content
            await db.country.update({
              where: { id: country.id },
              data: {
                [generation.section]: generation.content
              }
            });

            // Mark the generation as saved
            await db.contentGeneration.update({
              where: { id: generationId },
              data: { status: 'SAVED' }
            });

            return json({ status: 'SAVED', content: generation.content });
          }
        }
      }
      
      return json(status);
    }

    // Get the country name for the current country
    const country = await db.country.findUnique({
      where: { id },
      select: { name: true }
    });

    if (!country) {
      return json({ error: "Country not found" }, { status: 404 });
    }

    // Find all completed but unsaved generations for this country
    const completedGenerations = await db.contentGeneration.findMany({
      where: {
        countryName: country.name,
        status: 'COMPLETED',
        content: { not: null }
      },
      select: {
        id: true,
        countryName: true,
        section: true,
        content: true
      }
    });

    // Update each country with its generated content
    for (const generation of completedGenerations) {
      await db.country.update({
        where: { id },
        data: {
          [generation.section]: generation.content
        }
      });

      // Mark the generation as saved
      await db.contentGeneration.update({
        where: { id: generation.id },
        data: { status: 'SAVED' }
      });
    }

    return json({ 
      savedCount: completedGenerations.length,
      generations: completedGenerations.map(g => ({
        id: g.id,
        countryName: g.countryName,
        section: g.section
      }))
    });
  } catch (error) {
    console.error('Error processing generations:', error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to process generations" },
      { status: 500 }
    );
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method.toLowerCase() !== "post") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { id } = params;
  if (!id) {
    return json({ error: "Country ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { section } = body;

    if (!section) {
      return json({ error: "Section is required" }, { status: 400 });
    }

    // Get the country name
    const country = await db.country.findUnique({
      where: { id },
      select: { name: true }
    });

    if (!country) {
      return json({ error: "Country not found" }, { status: 404 });
    }

    // Start the generation process
    const { generationId } = await startContentGeneration(country.name, section as SectionKey);

    return json({ generationId });
  } catch (error) {
    console.error('Error starting content generation:', error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to start content generation" },
      { status: 500 }
    );
  }
} 