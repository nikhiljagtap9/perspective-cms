import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";
import { requireUserSession } from "~/lib/session.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id } = params;

  if (!id) {
    return json({ error: "Country ID is required" }, { status: 400 });
  }

  try {
    const reports = await db.report.findMany({
      where: {
        countryId: id,
      },
      select: {
        id: true,
        name: true,
        fileUrl: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return json({ reports });
  } catch (error) {
    console.error('Error fetching country reports:', error);
    return json(
      { error: "Failed to fetch country reports" },
      { status: 500 }
    );
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { id } = params;

  if (!id) {
    return json({ error: "Country ID is required" }, { status: 400 });
  }

  try {
    if (request.method === "DELETE") {
      const { reportId } = await request.json();
      
      if (!reportId) {
        return json({ error: "Report ID is required" }, { status: 400 });
      }

      await db.report.delete({
        where: {
          id: reportId,
          countryId: id, // Ensure report belongs to this country
        },
      });

      return json({ success: true });
    }

    // Existing POST logic
    const { name, fileUrl } = await request.json();
    if (!name || !fileUrl) {
      return json({ error: "Name and file are required" }, { status: 400 });
    }

    const report = await db.report.create({
      data: { name, fileUrl, countryId: id },
    });

    return json({ report });
  } catch (error) {
    console.error('Error handling report:', error);
    return json({ error: "Operation failed" }, { status: 500 });
  }
} 