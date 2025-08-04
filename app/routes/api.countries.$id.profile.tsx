import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const section = url.searchParams.get('section');
  const { id } = params;

  try {
    if (section) {
      const country = await db.country.findUnique({
        where: { id },
        select: {
          [section]: true
        }
      });

      if (!country) {
        return json({ error: "Country not found" }, { status: 404 });
      }

      return json({
        section,
        content: country[section as keyof typeof country]
      });
    } else {
      const country = await db.country.findUnique({
        where: { id }
      });

      if (!country) {
        return json({ error: "Country not found" }, { status: 404 });
      }

      return json(country);
    }
  } catch (error) {
    console.error('Error fetching section content:', error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to fetch section content" },
      { status: 500 }
    );
  }
} 