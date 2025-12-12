import formData from "form-data";
import Mailgun from "mailgun.js";

// Initialize Mailgun for sending emails
const mailgun = new Mailgun(formData);
const mg = process.env.MAILGUN_API_KEY
  ? mailgun.client({ username: "api", key: process.env.MAILGUN_API_KEY })
  : null;

/**
 * Send notification email to selected contractor with homeowner's details
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    contractor_email,
    contractor_name,
    tracking_token,
    customer_name,
    customer_phone,
    customer_address,
    service_type,
    description,
    quote_details,
  } = req.body;

  if (!contractor_email) {
    return res.status(400).json({ error: "Missing contractor_email" });
  }

  if (!mg) {
    console.error("Mailgun not configured - cannot send notification");
    return res.status(500).json({ error: "Email service not configured" });
  }

  const firstName = customer_name?.split(" ")[0] || "A customer";
  const priceInfo = quote_details?.price ? `Your quoted price: ${quote_details.price}` : "";
  const availInfo = quote_details?.availability ? `Availability discussed: ${quote_details.availability}` : "";

  const emailBody = `Great news!

${firstName} has selected you for their ${service_type || "service"} project.

Job Details:
- Service: ${service_type || "Home service"}
- Description: ${description || "Not specified"}
- Location: ${customer_address || "Contact customer for address"}

Customer Contact:
- Name: ${customer_name || "Customer"}
- Phone: ${customer_phone || "Not provided"}

${priceInfo}
${availInfo}

Please reach out to ${firstName} at your earliest convenience to schedule the job.

Thank you for using Quinn!

Best regards,
The Quinn Team`;

  try {
    await mg.messages.create("quotes.callquinn.com", {
      from: `Quinn <${tracking_token}@quotes.callquinn.com>`,
      to: contractor_email,
      subject: `You've been selected for a ${service_type || "service"} job!`,
      text: emailBody,
    });

    console.log("Sent selection notification to contractor:", contractor_email);
    return res.status(200).json({ success: true, message: "Contractor notified" });
  } catch (error) {
    console.error("Error sending contractor notification:", error);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
