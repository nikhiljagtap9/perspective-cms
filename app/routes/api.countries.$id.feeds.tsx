import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";
import { FeedType } from "@prisma/client";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id } = params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') as FeedType | null;

  if (!id) {
    return json({ error: "Country ID is required" }, { status: 400 });
  }

  try {
    const feeds = await db.feed.findMany({
      where: {
        countryId: id,
        ...(type && { type })
      },
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
        extraInfo: true,
        order: true,
      },
      orderBy: {
        order: 'asc'
      }
    });

    return json({ feeds });
  } catch (error) {
    console.error('Error fetching country feeds:', error);
    return json(
      { error: "Failed to fetch country feeds" },
      { status: 500 }
    );
  }
} 