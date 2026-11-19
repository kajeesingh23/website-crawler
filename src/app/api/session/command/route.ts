import { COMMANDS, runCommand, selectBySelector, type Command } from "@/lib/inspector/session";

export async function POST(req: Request) {
  const { command, selector } = (await req.json().catch(() => ({}))) as { command?: string; selector?: unknown };
  try {
    if (command === "select") {
      if (typeof selector !== "string" || !selector.trim() || selector.length > 500)
        return Response.json({ error: "Say which element to select." }, { status: 400 });
      if (!(await selectBySelector(selector))) return Response.json({ error: "Nothing on the page matches that." }, { status: 404 });
      return Response.json({ ok: true });
    }
    if (!COMMANDS.includes(command as Command)) return Response.json({ error: "Unknown command" }, { status: 400 });
    await runCommand(command as Command);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
