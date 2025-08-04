import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;

  try {
    const numbers = await db.emergencyNumber.findMany({
      where: { countryId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        number: true
      }
    });

    if (!numbers.length) {
      return json({ numbers: [] });
    }

    return json({ numbers });
  } catch (error) {
    console.error('Error fetching emergency numbers:', error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to fetch emergency numbers" },
      { status: 500 }
    );
  }
} 