import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/lib/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const countries = await db.country.findMany({
    where: { published: true },
    orderBy: { name: 'asc' }
  });

  return json({ countries });
} 