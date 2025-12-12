import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import Groq from "groq-sdk";
import formData from "form-data";
import Mailgun from "mailgun.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Groq only if API key is available
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Initialize Mailgun for sending replies
const mailgun = new Mailgun(formData);
const mg = process.env.MAILGUN_API_KEY
  ? mailgun.client({ username: "api", key: process.env.MAILGUN_API_KEY })
  : null;

/**
 * Analyze contractor email using Groq LLM to detect questions vs quotes
 */
async function analyzeContractorEmail(emailData, serviceRequest) {
  if (!groq) {
    console.warn("Groq not configured - skipping email analysis");
    return { type: "general", summary: "Email analysis not available" };
  }

  const additionalContext = serviceRequest?.additional_context || [];

  const prompt = `Analyze this contractor email response to a service request.

SERVICE REQUEST CONTEXT:
- Service Type: ${serviceRequest?.service_type || "Unknown"}
- Description: ${serviceRequest?.description || "Not provided"}
- Location: ${serviceRequest?.caller_address || serviceRequest?.zip_code || "Not provided"}
- Additional context already gathered: ${JSON.stringify(additionalContext)}

CONTRACTOR EMAIL:
From: ${emailData.sender}
Subject: ${emailData.subject}
Body: ${emailData.stripped_text || emailData.body_plain || ""}

Your task:
1. Classify this email as one of: "question", "quote", or "general"
   - "question" = contractor is asking for more information they need to provide a quote
   - "quote" = contractor is providing pricing, estimate, availability, or offering to do the work
   - "general" = acknowledgment, follow-up scheduling, or other communication

2. If it's a "question":
   - Extract the specific question they're asking (rephrase it clearly for the homeowner)
   - Check if we can answer it from the context above
   - If answerable, provide the answer

3. If it's a "quote":
   - Extract the price or estimate (could be a number, range, or "starting at" amount)
   - Extract their availability (when they can do the work)
   - Provide a brief summary

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "type": "question" | "quote" | "general",
  "question": "string - the question being asked (only if type is question)",
  "canAnswer": boolean - true if we have the info to answer (only if type is question),
  "answer": "string - the answer to provide (only if canAnswer is true)",
  "priceEstimate": "string - the price/estimate like '$150' or '$150-200' (only if type is quote)",
  "availability": "string - when they can do the work like 'available tomorrow' or 'this week' (only if type is quote)",
  "summary": "string - brief summary of what the contractor said"
}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    // Clean up response - remove markdown code blocks if present
    const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleanContent);
  } catch (error) {
    console.error("Error analyzing email with Groq:", error);
    return { type: "general", summary: "Could not analyze email" };
  }
}

/**
 * Send reply email to contractor via Mailgun
 */
async function sendContractorReply(originalEmail, answer, serviceRequest) {
  if (!mg) {
    console.error("Mailgun not configured - cannot send reply");
    return false;
  }

  const customerName = serviceRequest?.caller_name?.split(" ")[0] || "the homeowner";

  const emailBody = `Hi,

Thanks for getting back to us about the ${serviceRequest?.service_type || "service"} request!

To answer your question: ${answer}

Let me know if you need any other details to provide a quote.

Best regards,
Quinn (on behalf of ${customerName})`;

  try {
    await mg.messages.create("quotes.callquinn.com", {
      from: originalEmail.recipient, // Reply from the same tracking email
      to: originalEmail.sender,
      subject: `Re: ${originalEmail.subject || "Service Request"}`,
      text: emailBody,
    });

    console.log("Sent reply to contractor:", originalEmail.sender);
    return true;
  } catch (error) {
    console.error("Error sending contractor reply:", error);
    return false;
  }
}

/**
 * Trigger SMS to homeowner asking for additional info
 * This calls the Python backend which handles Twilio SMS
 */
async function triggerHomeownerQuestion(serviceRequestId, question, inboundEmailId, discoveredBusinessId) {
  // Store the pending question in the database
  const { data: pendingQuestion, error } = await supabase
    .from("pending_questions")
    .insert({
      service_request_id: serviceRequestId,
      inbound_email_id: inboundEmailId,
      discovered_business_id: discoveredBusinessId,
      question: question,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating pending question:", error);
    return false;
  }

  // Get service request to find homeowner phone
  const { data: serviceRequest } = await supabase
    .from("service_requests")
    .select("caller_phone, caller_name")
    .eq("id", serviceRequestId)
    .single();

  if (!serviceRequest?.caller_phone) {
    console.error("No phone number for service request:", serviceRequestId);
    return false;
  }

  // Call Python backend to send SMS
  // The backend URL depends on environment
  const backendUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const response = await fetch(`${backendUrl}/api/trigger-question-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_request_id: serviceRequestId,
        pending_question_id: pendingQuestion.id,
        question: question,
        to_phone: serviceRequest.caller_phone,
        customer_name: serviceRequest.caller_name,
      }),
    });

    if (response.ok) {
      // Update pending question status to "asked"
      await supabase
        .from("pending_questions")
        .update({ status: "asked", asked_at: new Date().toISOString() })
        .eq("id", pendingQuestion.id);

      console.log("Triggered SMS to homeowner for question:", question);
      return true;
    } else {
      console.error("Failed to trigger SMS:", await response.text());
      return false;
    }
  } catch (error) {
    console.error("Error triggering SMS:", error);
    return false;
  }
}

/**
 * Handle quote received - store quote and check if we should notify homeowner
 */
async function handleQuoteReceived(email, serviceRequestId, analysis, serviceRequest) {
  // Update discovered business status if we have a match
  if (email.discovered_business_id) {
    await supabase
      .from("discovered_businesses")
      .update({ outreach_status: "responded" })
      .eq("id", email.discovered_business_id);
  }

  // Update email status
  await supabase
    .from("inbound_emails")
    .update({ status: "quote_received" })
    .eq("id", email.id);

  // Store the quote with extracted details
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      service_request_id: serviceRequestId,
      discovered_business_id: email.discovered_business_id,
      inbound_email_id: email.id,
      price_estimate: analysis.priceEstimate || null,
      availability: analysis.availability || null,
      summary: analysis.summary || null,
      raw_quote_text: email.stripped_text || email.body_plain,
      status: "pending",
    })
    .select()
    .single();

  if (quoteError) {
    console.error("Error storing quote:", quoteError);
  } else {
    console.log("Quote stored:", quote.id, {
      price: analysis.priceEstimate,
      availability: analysis.availability,
    });
  }

  // Check if we should trigger the quotes SMS to homeowner
  await checkQuoteTrigger(serviceRequestId, serviceRequest);
}

/**
 * Check if we should send quotes to homeowner (5 quotes or 24hrs elapsed)
 */
async function checkQuoteTrigger(serviceRequestId, serviceRequest) {
  // Get count of pending quotes
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, price_estimate, availability, summary, discovered_business_id")
    .eq("service_request_id", serviceRequestId)
    .eq("status", "pending");

  if (error || !quotes) {
    console.error("Error fetching quotes:", error);
    return;
  }

  // Check if quotes were already presented
  if (serviceRequest.quotes_presented_at) {
    console.log("Quotes already presented to homeowner");
    return;
  }

  const quoteCount = quotes.length;
  const outreachStarted = serviceRequest.outreach_started_at
    ? new Date(serviceRequest.outreach_started_at)
    : null;
  const hoursSinceOutreach = outreachStarted
    ? (Date.now() - outreachStarted.getTime()) / (1000 * 60 * 60)
    : 0;

  console.log(`Quote check: ${quoteCount} quotes, ${hoursSinceOutreach.toFixed(1)} hours since outreach`);

  // Trigger if 5+ quotes OR (24+ hours AND at least 1 quote)
  if (quoteCount >= 5 || (hoursSinceOutreach >= 24 && quoteCount >= 1)) {
    console.log("Triggering quote presentation to homeowner");
    await sendQuotesToHomeowner(serviceRequestId, serviceRequest, quotes);
  }
}

/**
 * Send quotes SMS to homeowner
 */
async function sendQuotesToHomeowner(serviceRequestId, serviceRequest, quotes) {
  if (!serviceRequest.caller_phone) {
    console.error("No phone number for homeowner");
    return;
  }

  // Get business names for each quote
  const businessIds = quotes.map((q) => q.discovered_business_id).filter(Boolean);
  const { data: businesses } = await supabase
    .from("discovered_businesses")
    .select("id, business_name")
    .in("id", businessIds);

  const businessMap = {};
  businesses?.forEach((b) => {
    businessMap[b.id] = b.business_name;
  });

  // Build quote list for SMS
  const quoteLines = quotes.map((q) => {
    const name = businessMap[q.discovered_business_id] || "A contractor";
    const price = q.price_estimate || "price TBD";
    const avail = q.availability || "availability TBD";
    return `- ${name}: ${price}, ${avail}`;
  });

  const customerName = serviceRequest.caller_name?.split(" ")[0] || "there";
  const serviceType = serviceRequest.service_type || "your service request";

  const message = `Hey ${customerName}! Got ${quotes.length} quote${quotes.length > 1 ? "s" : ""} for ${serviceType}:

${quoteLines.join("\n")}

Which one works for you?`;

  // Call Python backend to send SMS
  const backendUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const response = await fetch(`${backendUrl}/api/send-quotes-sms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_request_id: serviceRequestId,
        to_phone: serviceRequest.caller_phone,
        message: message,
        quote_ids: quotes.map((q) => q.id),
      }),
    });

    if (response.ok) {
      // Mark quotes as presented
      await supabase
        .from("quotes")
        .update({ status: "presented", presented_at: new Date().toISOString() })
        .in("id", quotes.map((q) => q.id));

      // Update service request
      await supabase
        .from("service_requests")
        .update({ quotes_presented_at: new Date().toISOString() })
        .eq("id", serviceRequestId);

      console.log("Sent quotes SMS to homeowner:", serviceRequest.caller_phone);
    } else {
      console.error("Failed to send quotes SMS:", await response.text());
    }
  } catch (error) {
    console.error("Error sending quotes SMS:", error);
  }
}

// Mailgun sends inbound emails as multipart/form-data POST requests
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Mailgun webhook verification (optional but recommended)
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
      recipient,
      sender,
      from: fromHeader,
      subject,
      "body-plain": bodyPlain,
      "body-html": bodyHtml,
      "stripped-text": strippedText,
      "attachment-count": attachmentCount,
    } = req.body;

    console.log("Received inbound email:", {
      recipient,
      sender,
      subject,
      bodyLength: bodyPlain?.length || 0,
    });

    // Extract tracking token from recipient email
    const emailMatch = recipient?.match(/^([^@]+)@quotes\.callquinn\.com$/i);
    const trackingToken = emailMatch?.[1];

    if (!trackingToken) {
      console.warn("Could not extract tracking token from recipient:", recipient);
    }

    // Look up service request by tracking token
    let serviceRequestId = null;
    let discoveredBusinessId = null;
    let serviceRequest = null;

    if (trackingToken) {
      const { data: sr } = await supabase
        .from("service_requests")
        .select("id, service_type, description, caller_address, zip_code, caller_name, caller_phone, additional_context, outreach_started_at, quotes_presented_at")
        .eq("tracking_token", trackingToken)
        .single();

      if (sr) {
        serviceRequest = sr;
        serviceRequestId = sr.id;

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

    // If we have a matched service request, analyze the email
    let analysisResult = null;
    if (serviceRequestId && serviceRequest) {
      const emailData = {
        sender,
        subject,
        stripped_text: strippedText,
        body_plain: bodyPlain,
        recipient,
      };

      analysisResult = await analyzeContractorEmail(emailData, serviceRequest);
      console.log("Email analysis result:", analysisResult);

      // Handle based on email type
      if (analysisResult.type === "question") {
        if (analysisResult.canAnswer && analysisResult.answer) {
          // We can answer from existing context - auto-reply
          const sent = await sendContractorReply(
            { ...email, recipient, sender, subject },
            analysisResult.answer,
            serviceRequest
          );

          if (sent) {
            // Store a pending_question record marked as already replied
            await supabase.from("pending_questions").insert({
              service_request_id: serviceRequestId,
              inbound_email_id: email.id,
              discovered_business_id: discoveredBusinessId,
              question: analysisResult.question,
              answer: analysisResult.answer,
              status: "replied",
              answered_at: new Date().toISOString(),
            });

            // Update email status
            await supabase
              .from("inbound_emails")
              .update({ status: "auto_replied" })
              .eq("id", email.id);
          }
        } else {
          // Need to ask homeowner - trigger SMS
          await triggerHomeownerQuestion(
            serviceRequestId,
            analysisResult.question,
            email.id,
            discoveredBusinessId
          );

          // Update email status
          await supabase
            .from("inbound_emails")
            .update({ status: "awaiting_info" })
            .eq("id", email.id);
        }
      } else if (analysisResult.type === "quote") {
        await handleQuoteReceived(email, serviceRequestId, analysisResult, serviceRequest);
      }
    }

    // Mailgun expects 200 OK to confirm receipt
    return res.status(200).json({
      success: true,
      emailId: email.id,
      matched: !!serviceRequestId,
      analysis: analysisResult,
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
