import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { Form } from "@remix-run/react";

export async function action({ request }: ActionFunctionArgs) {
  return redirect("/auth/login", {
    headers: {
      "Set-Cookie": "auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    },
  });
}

export default function Logout() {
  return (
    <Form method="post">
      <button type="submit" style={{ display: 'none' }}>Logout</button>
    </Form>
  );
} 