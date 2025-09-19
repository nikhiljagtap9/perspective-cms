// app/routes/usmentionresources.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { Button } from "~/components/ui/button";

export async function loader({}: LoaderFunctionArgs) {
  const usMentionsSources = await db.usMentionsSource.findMany({
    orderBy: { createdAt: "desc" },
  });

  return json({
    usMentionsSources: usMentionsSources.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}

export default function UsMentionResourcesList() {
  const { usMentionsSources } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">US Mentions Sources</h1>
        <Button asChild>
          <Link to="/usmentionresources/new">New Source</Link>
        </Button>
      </div>

      <div className="space-y-4">
        {usMentionsSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources yet.</p>
        ) : (
          usMentionsSources.map((src) => (
            <div
              key={src.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <h3 className="font-medium">{src.name}</h3>
                <p className="text-sm text-muted-foreground">{src.url}</p>
                {src.notes && <p className="text-sm">{src.notes}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
