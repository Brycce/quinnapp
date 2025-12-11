import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mailgun sends inbound emails as multipart/form-data POST requests
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Mailgun webhook verification (optional but recommended)
    // The signature is: timestamp + token + api_key hashed
    const { timestamp, token, signature } = req.body;

    if (process.env.MAILGUN_WEBHOOK_SIGNING_KEY && timestamp && token && signature) {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.MAILGUN_WEBHOOK_SIGNING_KEY)
        .update(timestamp + token)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("Invalid Mailgun signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Extract email data from Mailgun's POST payload
    const {
      recipient,        // e.g., "req_abc123@callquinn.com"
      sender,           // e.g., "plumber@example.com"
      from: fromHeader, // Full "From" header with name
      subject,
      "body-plain": bodyPlain,
      "body-html": bodyHtml,
      "stripped-text": strippedText,  // Email body without signatures/quotes
      "attachment-count": attachmentCount,
    } = req.body;

    console.log("Received inbound email:", {
      recipient,
      sender,
      subject,
      bodyLength: bodyPlain?.length || 0,
    });

    // Extract tracking token from recipient email
    // Format: {tracking_token}@callquinn.com or req_{tracking_token}@callquinn.com
    const emailMatch = recipient?.match(/^(?:req_)?([^@]+)@callquinn\.com$/i);
    const trackingToken = emailMatch?.[1];

    if (!trackingToken) {
      console.warn("Could not extract tracking token from recipient:", recipient);
    }

    // Look up service request by tracking token
    let serviceRequestId = null;
    let discoveredBusinessId = null;

    if (trackingToken) {
      // First try to find a service request with this tracking token
      const { data: serviceRequest } = await supabase
        .from("service_requests")
        .select("id")
        .eq("tracking_token", trackingToken)
        .single();

      if (serviceRequest) {
        serviceRequestId = serviceRequest.id;

        // Try to match sender email to a discovered business
        const { data: business } = await supabase
          .from("discovered_businesses")
          .select("id")
          .eq("service_request_id", serviceRequestId)
          .eq("email", sender)
          .single();

        if (business) {
          discoveredBusinessId = business.id;
        }
      }
    }

    // Parse attachments if present
    let attachments = [];
    if (parseInt(attachmentCount) > 0) {
      // Mailgun sends attachments as attachment-1, attachment-2, etc.
      // For now, just log the count - full attachment handling would need file storage
      attachments = [{ count: parseInt(attachmentCount) }];
    }

    // Store the email
    const { data: email, error: insertError } = await supabase
      .from("inbound_emails")
      .insert({
        recipient,
        tracking_token: trackingToken,
        service_request_id: serviceRequestId,
        discovered_business_id: discoveredBusinessId,
        sender,
        from_email: fromHeader,
        subject,
        body_plain: bodyPlain,
        body_html: bodyHtml,
        stripped_text: strippedText,
        attachments,
        raw_payload: req.body,
        status: serviceRequestId ? "matched" : "unmatched",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error storing email:", insertError);
      return res.status(500).json({ error: "Failed to store email" });
    }

    console.log("Stored inbound email:", email.id, {
      matched: !!serviceRequestId,
      trackingToken,
    });

    // TODO: Future enhancements:
    // 1. Send notification to user when quote/estimate is received
    // 2. Parse email content to extract pricing information
    // 3. Update discovered_business outreach_status to "responded"

    // Mailgun expects 200 OK to confirm receipt
    return res.status(200).json({
      success: true,
      emailId: email.id,
      matched: !!serviceRequestId,
    });

  } catch (error) {
    console.error("Inbound email error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Vercel config - need to handle multipart form data
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};
