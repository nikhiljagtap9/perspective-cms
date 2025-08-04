import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id } = params;

  if (!id) {
    return json({ error: "Country ID is required" }, { status: 400 });
  }

  try {
    const country = await db.country.findUnique({
      where: {
        id
      },
      select: {
        embassyInUsUrl: true,
        usEmbassyUrl: true,
      }
    });

    if (!country) {
      return json({ error: "Country not found" }, { status: 404 });
    }

    return json({
      embassies: {
        embassyInUs: country.embassyInUsUrl,
        usEmbassy: country.usEmbassyUrl
      }
    });
  } catch (error) {
    console.error('Error fetching country embassy information:', error);
    return json(
      { error: "Failed to fetch embassy information" },
      { status: 500 }
    );
  }
} 