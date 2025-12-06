import { Stagehand } from "@browserbasehq/stagehand";
import { createGroq } from "@ai-sdk/groq";
import { AISdkClient } from "@browserbasehq/stagehand";

export const config = {
  runtime: "nodejs",
  maxDuration: 120, // 2 minutes for form filling
};

interface FormFillRequest {
  businessId: string;
  businessName: string;
  website: string;
  serviceRequest: {
    customerName: string;
    serviceType: string;
    description: string;
    location: string;
    timeline: string;
    phoneCallback?: string;
  };
}

interface FormFillResult {
  success: boolean;
  businessId: string;
  message: string;
  formUrl?: string;
  screenshotUrl?: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body: FormFillRequest = await req.json();
  const { businessId, businessName, website, serviceRequest } = body;

  if (!website || !serviceRequest) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let stagehand: Stagehand | null = null;

  try {
    // Create Groq client for Stagehand
    const groqProvider = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const groqClient = new AISdkClient({
      model: groqProvider("llama-3.3-70b-versatile"),
    });

    // Initialize Stagehand with Browserbase
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      llmClient: groqClient,
      enableCaching: true,
      verbose: 1,
    });

    await stagehand.init();
    const page = stagehand.context.pages()[0];

    // Navigate to the business website
    await page.goto(website, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Try to find and navigate to contact page
    const foundContact = await stagehand.act({
      action: "Look for and click a 'Contact', 'Contact Us', 'Get a Quote', 'Request Quote', or 'Get Estimate' link or button. If none found, that's okay.",
    });

    // Wait a moment for page to load
    await page.waitForTimeout(2000);

    // Check if there's a contact form on this page
    const formObservation = await stagehand.observe({
      instruction: "Find any contact form, quote request form, or inquiry form on this page. Look for input fields like name, email, phone, message, or description.",
    });

    if (!formObservation || formObservation.length === 0) {
      await stagehand.close();
      return new Response(
        JSON.stringify({
          success: false,
          businessId,
          message: "No contact form found on website",
        } as FormFillResult),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Compose the message to send
    const message = `Hi, my name is ${serviceRequest.customerName}. I'm looking for help with ${serviceRequest.serviceType}.

${serviceRequest.description}

Location: ${serviceRequest.location}
Timeline: ${serviceRequest.timeline}

Please contact me to discuss this project. Thank you!`;

    // Fill the form using natural language
    await stagehand.act({
      action: `Fill out the contact form with this information:
- Name: ${serviceRequest.customerName}
- Email: quinn@getquinn.ai
- Phone: ${serviceRequest.phoneCallback || "Leave blank if optional"}
- Message/Description: ${message}
- For any service type dropdown, select the closest match to "${serviceRequest.serviceType}"
- Fill in location/address if there's a field: ${serviceRequest.location}
Skip any fields that don't apply or are optional and not listed above.`,
    });

    // Take a screenshot before submitting
    const currentUrl = page.url();

    // Submit the form
    await stagehand.act({
      action: "Click the submit button, send button, or any button that submits the contact form. Common labels include 'Submit', 'Send', 'Send Message', 'Get Quote', 'Request Quote'.",
    });

    // Wait for submission
    await page.waitForTimeout(3000);

    await stagehand.close();

    return new Response(
      JSON.stringify({
        success: true,
        businessId,
        message: `Form submitted successfully to ${businessName}`,
        formUrl: currentUrl,
      } as FormFillResult),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {}
    }

    console.error("Form fill error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        businessId,
        message: error.message || "Form filling failed",
      } as FormFillResult),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}
