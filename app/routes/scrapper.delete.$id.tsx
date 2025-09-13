import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { db } from "~/lib/db.server";

export async function action({ params }: ActionFunctionArgs) {
  const { id } = params;

  if (!id) {
    throw new Response("Feed ID is required", { status: 400 });
  }

  try {
    await db.scrapperData.delete({
      where: { id: Number(id) },
    });
    return redirect("/scrapper");
  } catch (error) {
    console.error("Error deleting feed:", error);
    throw new Response("Failed to delete feed", { status: 500 });
  }
}
