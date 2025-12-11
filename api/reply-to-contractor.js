import { createClient } from "@supabase/supabase-js";
import formData from "form-data";
import Mailgun from "mailgun.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Mailgun for sending replies
const mailgun = new Mailgun(formData);
const mg = process.env.MAILGUN_API_KEY
  ? mailgun.client({ username: "api", key: process.env.MAILGUN_API_KEY })
  : null;

/**
 * Send reply email to contractor via Mailgun
 * Called by Python backend after homeowner answers a question
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    pending_question_id,
    original_email,
    question,
    answer,
    service_request,
  } = req.body;

  if (!original_email || !answer) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!mg) {
    console.error("Mailgun not configured - cannot send reply");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const customerName = service_request?.caller_name?.split(" ")[0] || "the homeowner";
  const serviceType = service_request?.service_type || "service";

  const emailBody = `Hi,

Thanks for getting back to us about the ${serviceType} request!

To answer your question: ${answer}

Let me know if you need any other details to provide a quote.

Best regards,
Quinn (on behalf of ${customerName})`;

  try {
    await mg.messages.create("quotes.callquinn.com", {
      from: original_email.recipient, // Reply from the same tracking email
      to: original_email.sender,
      subject: `Re: ${original_email.subject || "Service Request"}`,
      text: emailBody,
    });

    console.log("Sent reply to contractor:", original_email.sender);

    // Update pending question status to replied
    if (pending_question_id) {
      await supabase
        .from("pending_questions")
        .update({ status: "replied" })
        .eq("id", pending_question_id);
    }

    // Update inbound email status
    if (original_email.id) {
      await supabase
        .from("inbound_emails")
        .update({ status: "replied" })
        .eq("id", original_email.id);
    }

    return res.status(200).json({
      success: true,
      message: "Reply sent to contractor",
    });
  } catch (error) {
    console.error("Error sending contractor reply:", error);
    return res.status(500).json({
      error: "Failed to send email",
      details: error.message,
    });
  }
}
