import { redirect } from "@remix-run/node";
import { getUserFromSession } from "./auth.server";

export async function requireAuth(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  const cookies = Object.fromEntries(
    cookieHeader?.split(";").map(cookie => cookie.trim().split("=")) ?? []
  );
  
  const token = cookies.auth_token;
  if (!token) {
    throw redirect("/auth/login");
  }

  const user = await getUserFromSession(token);
  if (!user) {
    throw redirect("/auth/login");
  }

  return user;
} 