import { ActionFunctionArgs, json } from "@remix-run/node";
import { db } from "~/lib/db.server";
import { createUserSession, hashPassword } from "~/lib/auth.server";

type ActionResponse = {
  error?: string;
  success?: boolean;
  token?: string;
};

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toLowerCase() !== "post") {
    return json<ActionResponse>(
      { error: "Method not allowed" },
      { status: 405 }
    );
  }

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return json<ActionResponse>(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { username } });
    
    if (!user) {
      return json<ActionResponse>(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const hashedPassword = await hashPassword(password);
    if (user.password !== hashedPassword || user.role === 'USER') {
      return json<ActionResponse>(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const token = await createUserSession(user.id);
    
    return json<ActionResponse>(
      { 
        success: true,
        token
      },
      {
        headers: {
          "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
        },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return json<ActionResponse>(
      { error: "An error occurred during login" },
      { status: 500 }
    );
  }
} 