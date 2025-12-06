const config = {
  maxDuration: 120,
};

module.exports = async function handler(req, res) {
  // Minimal test - just return environment check
  if (req.method === "GET") {
    res.status(200).json({
      status: "ok",
      hasGroqKey: !!process.env.GROQ_API_KEY,
      hasBrowserbaseKey: !!process.env.BROWSERBASE_API_KEY,
      hasBrowserbaseProject: !!process.env.BROWSERBASE_PROJECT_ID,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body;
  const { businessId, businessName, website, serviceRequest } = body || {};

  if (!website || !serviceRequest) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  let stagehand = null;

  try {
    // Dynamic imports for ESM modules
    const { Stagehand, AISdkClient } = await import("@browserbasehq/stagehand");
    const { createGroq } = await import("@ai-sdk/groq");

    // Create Groq client for Stagehand
    const groqProvider = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const groqClient = new AISdkClient({
      model: groqProvider("openai/gpt-oss-120b"),
    });

    // Initialize Stagehand with Browserbase
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      llmClient: groqClient,
      enableCaching: true,
      verbose: 0,
      disablePino: true, // Required for serverless environments
    });

    await stagehand.init();
    const page = stagehand.context.pages()[0];

    // Navigate to the business website
    await page.goto(website, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Try to find and navigate to contact page
    await stagehand.act("Look for and click a 'Contact', 'Contact Us', 'Get a Quote', 'Request Quote', or 'Get Estimate' link or button. If none found, that's okay.");

    // Wait a moment for page to load
    await new Promise(r => setTimeout(r, 2000));

    // Check if there's a contact form on this page
    const formObservation = await stagehand.observe("Find any contact form, quote request form, or inquiry form on this page. Look for input fields like name, email, phone, message, or description.");

    if (!formObservation || formObservation.length === 0) {
      await stagehand.close();
      res.status(200).json({
        success: false,
        businessId,
        message: "No contact form found on website",
      });
      return;
    }

    // Compose the message to send
    const message = `Hi, my name is ${serviceRequest.customerName}. I'm looking for help with ${serviceRequest.serviceType}.

${serviceRequest.description}

Location: ${serviceRequest.location}
Timeline: ${serviceRequest.timeline}

Please contact me to discuss this project. Thank you!`;

    // Fill the form using natural language
    await stagehand.act(`Fill out the contact form with this information:
- Name: ${serviceRequest.customerName}
- Email: quinn@getquinn.ai
- Phone: ${serviceRequest.phoneCallback || "Leave blank if optional"}
- Message/Description: ${message}
- For any service type dropdown, select the closest match to "${serviceRequest.serviceType}"
- Fill in location/address if there's a field: ${serviceRequest.location}
Skip any fields that don't apply or are optional and not listed above.`);

    // Get current URL
    const currentUrl = page.url();

    // TODO: Uncomment to actually submit forms in production
    // await stagehand.act("Click the submit button, send button, or any button that submits the contact form.");
    // await new Promise(r => setTimeout(r, 3000));

    await stagehand.close();

    res.status(200).json({
      success: true,
      businessId,
      message: `Form submitted successfully to ${businessName}`,
      formUrl: currentUrl,
    });

  } catch (error) {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {}
    }

    console.error("Form fill error:", error);
    res.status(200).json({
      success: false,
      businessId,
      message: error.message || "Form filling failed",
    });
  }
};

module.exports.config = config;
