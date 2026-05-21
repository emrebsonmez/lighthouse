import { Router } from "express";
import { handleInboundSms } from "../../services/inbound-sms-router.js";

export const twilioWebhookRouter = Router();

twilioWebhookRouter.post("/sms", async (req, res) => {
  const from = (req.body.From as string) ?? "";
  const body = (req.body.Body as string) ?? "";
  const reply = await handleInboundSms(from, body);
  res.type("text/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`,
  );
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
