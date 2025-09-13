import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const { feed_id } = params;

  if (!feed_id) {
    return json({ error: "Feed ID is required" }, { status: 400 });
  }

  try {
    const feed = await db.scrapperData.findUnique({
      where: { id: Number(feed_id) },
      select: {
        id: true,
        url: true,
        feed_type: true,
        content: true,
        created_at: true,
        updated_at: true,
        Country: {
          select: { id: true, name: true },
        },
      },
    });

    if (!feed) {
      return json({ error: "Feed not found" }, { status: 404 });
    }

    return json({ feed });
  } catch (error) {
    console.error("Error fetching scrapper feed:", error);
    return json(
      { error: "Failed to fetch scrapper feed" },
      { status: 500 }
    );
  }
}
