import "dotenv/config";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

async function main() {
  const app = await Spectrum({
    projectId: process.env.PHOTON_PROJECT_ID!,
    projectSecret: process.env.PHOTON_PROJECT_SECRET!,
    providers: [imessage.config()],
  });

  const target = process.env.TARGET_PHONE;
  if (target) {
    const im = imessage(app);
    const user = await im.user(target);
    const dm = await im.space(user);
    await dm.send("hello from photon");
  }

  for await (const [, message] of app.messages) {
    if (message.platform !== "iMessage") continue;
    if (message.content.type === "text") {
      const text = message.content.text;
      console.log(`[${message.platform}] ${message.sender.id}: ${text}`);
      // echo removed — sms-handler.js handles replies via npm start
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
