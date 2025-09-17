import { LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { db } from "~/lib/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const feedId = url.searchParams.get("feed_id");

  if (!feedId) {
    throw new Response("Feed ID missing", { status: 400 });
  }

  const feed = await db.scrapperData.findUnique({
    where: { id: Number(feedId) },
    include: { Country: true },
  });

  if (!feed) {
    throw new Response("Feed not found", { status: 404 });
  }

  return json({ feed });
}

export default function FeedPage() {
  const { feed } = useLoaderData<typeof loader>();

  let parsedContent: any = null;
  try {
    parsedContent = feed.content ? JSON.parse(feed.content) : null;
  } catch (err) {
    console.error("Invalid JSON in content:", err);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{feed.feed_type}</h1>
      <p className="text-gray-600">
        Country: {feed.Country.name} | URL: {feed.url}
      </p>

      <div className="border p-4 rounded">
        <h2 className="text-xl font-semibold">Content</h2>

        {parsedContent ? (
          <div className="mt-4">
            {/* Channel Info */}
            <div className="mb-6">
              <h3 className="text-lg font-bold">{parsedContent.channel.title}</h3>
              <p className="text-sm text-gray-500">
                {parsedContent.channel.description}
              </p>
              <a
                href={parsedContent.channel.link}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                {parsedContent.channel.link}
              </a>
            </div>

            {/* Articles */}
            <div className="space-y-4">
              {parsedContent.channel.items.length > 0 ? (
                parsedContent.channel.items.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 border rounded hover:bg-gray-800"
                  >
                    <h4 className="font-semibold">{item.title}</h4>
                    <p className="text-sm text-gray-600">{item.pubDate}</p>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 underline"
                    >
                      {item.link}
                    </a>
                  </div>
                ))
              ) : (
                <div className="p-3 border rounded bg-gray-100">
                  <p className="text-sm text-gray-600 italic">
                    ⚠️ No articles found for this source.
                  </p>
                  {parsedContent.channel.meta && (
                    <p className="text-xs text-gray-500">
                      Status: {parsedContent.channel.meta.status} | 
                      Articles: {parsedContent.channel.meta.article_count}
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        ) : (
          <p>No content yet (waiting for scraper).</p>
        )}
      </div>
    </div>
  );
}
