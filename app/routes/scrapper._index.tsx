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
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 10;

  const term = searchTerm.toLowerCase();

  // 🔹 Compute feeds with status
  const feedsWithStatus = feeds.map((feed) => {
    let status = "unknown";
    let reason: string | null = null;

    try {
      const parsed = feed.content ? JSON.parse(feed.content) : null;
      status =
        parsed?.channel?.meta?.status ??
        (parsed?.channel?.items?.length > 0 ? "success" : "empty");
      reason = parsed?.channel?.meta?.reason ?? null;
    } catch {
      status = "invalid";
    }

    return { ...feed, status, reason };
  });

  // 🔹 Apply filters
  const filteredFeeds = feedsWithStatus.filter((feed) => {
    const matchesSearch =
      feed.Country.name.toLowerCase().includes(term) ||
      feed.feed_type.toLowerCase().includes(term) ||
      new Date(feed.created_at).toLocaleDateString().toLowerCase().includes(term);

    const matchesStatus =
      statusFilter === "all" || feed.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // 🔹 Pagination
  const totalPages = Math.ceil(filteredFeeds.length / itemsPerPage);
  const paginatedFeeds = filteredFeeds.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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

      {/* Search + Status Filter */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search feeds (country, url, type, date)..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="border rounded px-3 py-2"
          style={{ background: "hsl(var(--card))" }}
        >
          <option value="all">All</option>
          <option value="success">Success</option>
          <option value="empty">Empty</option>
          <option value="error">Error</option>
          <option value="invalid">Invalid</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Country</TableHead>
              <TableHead>Scrapper URL</TableHead>
              <TableHead>Feed Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Updated At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedFeeds.map((feed) => (
              <TableRow key={feed.id}>
                <TableCell>{feed.Country.name}</TableCell>
                <TableCell>
                  {`${baseUrl}/api/scrapper/feed/${feed.id}`}
                </TableCell>
                <TableCell>{feed.feed_type}</TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      feed.status === "success"
                        ? "bg-green-500 text-green-800"
                        : feed.status === "empty"
                        ? "bg-yellow-200 text-yellow-800"
                        : feed.status === "error"
                        ? "bg-red-200 text-red-800"
                        : feed.status === "invalid"
                        ? "bg-red-200 text-red-900"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {feed.status}
                  </span>
                  {feed.status === "error" && feed.reason && (
                    <div className="text-xs text-red-600 mt-1">
                      {feed.reason}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {new Date(feed.created_at).toLocaleDateString()}
                </TableCell>
                 <TableCell>
                  {new Date(feed.updated_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/scrapper/feed?feed_id=${feed.id}`}>View</Link>
                  </Button>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to={`/scrapper/edit/${feed.id}`}>Edit</Link>
                  </Button>
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

            {paginatedFeeds.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-gray-500 p-4"
                >
                  No feeds found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="px-3 py-2 text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
