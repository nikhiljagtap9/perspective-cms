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
        Country: {feed.Country.name}
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
{/* Articles */}
<div className="space-y-4">
  {parsedContent.channel.items.length > 0 ? (
    parsedContent.channel.items.map((item: any, idx: number) => (
      <div
        key={idx}
        className="flex items-start space-x-3 p-3 border rounded hover:bg-gray-800"
      >
        {/* Thumbnail/Profile Image */}
        {item.thumbnails ? (
          <img
            src={item.thumbnails}
            alt={item["dc:creator"] || "avatar"}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-white">
            {item["dc:creator"]?.[0]?.toUpperCase() || "?"}
          </div>
        )}

        {/* Content */}
        <div className="flex-1">
          <h4 className="font-semibold text-gray-100">{item.title}</h4>

          {feed.feed_type === "DAILY_SUMMARY" ? (
            <div className="prose prose-sm max-w-none text-gray-200">
              <pre className="whitespace-pre-wrap text-sm">
                {item.description}
              </pre>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400">@{item["dc:creator"]} {item.pubDate} </p>
              {item.description && (
                <p className="text-sm text-gray-200 mt-1">
                  {item.description}
                </p>
              )}
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 underline text-sm"
                >
                  View Tweet
                </a>
              )}
            </>
          )}
        </div>
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
