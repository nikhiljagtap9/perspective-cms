import { json, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, Form } from "@remix-run/react";
import { PlusCircle, Search } from "lucide-react";
import { db } from "~/lib/db.server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const feeds = await db.scrapperData.findMany({
    include: { Country: true },
    orderBy: { created_at: "desc" },
  });
  return json({ feeds, baseUrl });
}

export default function Scrapper() {
  const { feeds, baseUrl } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");

  // 🔹 Normalize search term
  const term = searchTerm.toLowerCase();

  // 🔹 Filter across all fields
  const filteredFeeds = feeds.filter((feed) => {
    return (
      feed.Country.name.toLowerCase().includes(term) ||
      feed.url.toLowerCase().includes(term) ||
      feed.feed_type.toLowerCase().includes(term) ||
      new Date(feed.created_at)
        .toLocaleDateString()
        .toLowerCase()
        .includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">
          Scrapper ({filteredFeeds.length})
        </h1>
        <Button asChild>
          <Link to="/scrapper/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add New Scrapper
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search feeds (country, url, type, date)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead>Feed URL</TableHead>
              <TableHead>Scrapper URL</TableHead>
              <TableHead>Feed Type</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFeeds.map((feed) => (
              <TableRow key={feed.id}>
                <TableCell>{feed.Country.name}</TableCell>
                <TableCell>{feed.url}</TableCell>
                <TableCell>
                  {`${baseUrl}/api/scrapper/feed/${feed.id}`}
                </TableCell>
                <TableCell>{feed.feed_type}</TableCell>
                <TableCell>
                  {new Date(feed.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="flex gap-2 justify-end">
                  {/* View */}
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/scrapper/feed?feed_id=${feed.id}`}>
                      View
                    </Link>
                  </Button>

                  {/* Edit */}
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/scrapper/edit/${feed.id}`}>
                      Edit
                    </Link>
                  </Button>

                  {/* Delete */}
                  <Form
                    method="post"
                    action={`/scrapper/delete/${feed.id}`}
                    onSubmit={(e) => {
                      if (!confirm("Are you sure you want to delete this feed?")) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <Button type="submit" variant="secondary" size="sm">
                      Delete
                    </Button>
                  </Form>
                </TableCell>
              </TableRow>
            ))}
            {filteredFeeds.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500 p-4">
                  No feeds found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
