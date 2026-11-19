import { COMMANDS, runCommand, type Command } from "@/lib/inspector/session";

export async function POST(req: Request) {
  const { command } = (await req.json().catch(() => ({}))) as { command?: string };
  if (!COMMANDS.includes(command as Command)) return Response.json({ error: "Unknown command" }, { status: 400 });
  try {
    await runCommand(command as Command);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
