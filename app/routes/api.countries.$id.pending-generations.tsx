import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const country = await db.country.findUnique({
    where: { id: params.id },
    select: { name: true }
  });

  if (!country) {
    throw new Response("Country not found", { status: 404 });
  }

  const generatingContent = await db.contentGeneration.findMany({
    where: {
      countryName: country.name,
      status: {
        in: ['PENDING', 'COMPLETED']
      }
    },
    select: {
      section: true
    }
  });

  return json({
    inProgressCount: generatingContent.length,
    generatingSections: generatingContent.map(gen => gen.section)
  });
} 