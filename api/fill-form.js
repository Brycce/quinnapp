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

    // Debug log
    const debugLog = [];
    debugLog.push({ step: "init", time: Date.now() });

    // Initialize Stagehand with Browserbase
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      llmClient: groqClient,
      enableCaching: false, // Disable caching for debugging
      verbose: 2, // Enable verbose logging
      disablePino: true, // Required for serverless
      browserbaseSessionCreateParams: {
        browserSettings: {
          solveCaptchas: true, // Enable automatic CAPTCHA solving
        },
      },
    });

    await stagehand.init();
    debugLog.push({ step: "stagehand_initialized", time: Date.now() });

    const page = stagehand.context.pages()[0];

    // Navigate to the business website
    await page.goto(website, { waitUntil: "domcontentloaded", timeout: 30000 });
    debugLog.push({ step: "navigated_to_website", url: page.url(), time: Date.now() });

    // Try to find and navigate to contact page
    const navResult = await stagehand.act("Look for and click a 'Contact', 'Contact Us', 'Get a Quote', 'Request Quote', or 'Get Estimate' link or button. If none found, that's okay.");
    debugLog.push({ step: "nav_to_contact", result: navResult, time: Date.now() });

    // Wait a moment for page to load
    await new Promise(r => setTimeout(r, 2000));
    debugLog.push({ step: "after_wait", url: page.url(), time: Date.now() });

    // Check if there's a contact form on this page
    const formObservation = await stagehand.observe("Find any contact form, quote request form, or inquiry form on this page. Look for input fields like name, email, phone, message, or description.");
    debugLog.push({ step: "observe_form", found: formObservation?.length || 0, observation: formObservation, time: Date.now() });

    if (!formObservation || formObservation.length === 0) {
      // Take screenshot before closing
      const screenshotBuffer = await page.screenshot();
      const screenshotBase64 = screenshotBuffer.toString('base64');
      await stagehand.close();
      res.status(200).json({
        success: false,
        businessId,
        message: "No contact form found on website",
        debug: debugLog,
        screenshotPreview: screenshotBase64.substring(0, 200) + "...",
      });
      return;
    }

    // Compose the message to send
    const message = `Hi, my name is ${serviceRequest.customerName}. I'm looking for help with ${serviceRequest.serviceType}. ${serviceRequest.description} Location: ${serviceRequest.location}. Timeline: ${serviceRequest.timeline}. Please contact me to discuss. Thank you!`;

    // Fill the form field by field (act() does ONE action at a time)
    const fillResults = [];

    // Fill name field
    const nameResult = await stagehand.act(`Type "${serviceRequest.customerName}" into the name field or first name field of the contact form`);
    fillResults.push({ field: "name", result: nameResult });

    // Fill email field
    const emailResult = await stagehand.act(`Type "quinn@getquinn.ai" into the email field of the contact form`);
    fillResults.push({ field: "email", result: emailResult });

    // Fill phone field if available
    const phoneResult = await stagehand.act(`Type "${serviceRequest.phoneCallback || '250-555-0123'}" into the phone field of the contact form. If no phone field exists, skip this.`);
    fillResults.push({ field: "phone", result: phoneResult });

    // Fill message/description field
    const messageResult = await stagehand.act(`Type the following message into the message, comments, description, or textarea field of the contact form: "${message}"`);
    fillResults.push({ field: "message", result: messageResult });

    debugLog.push({ step: "fill_form", results: fillResults, time: Date.now() });

    // Scroll to top to capture full form in screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    // Take full-page screenshot after filling
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString('base64');
    debugLog.push({ step: "screenshot_taken", time: Date.now() });

    // Get current URL
    const currentUrl = page.url();

    // TODO: Uncomment to actually submit forms in production
    // await stagehand.act("Click the submit button, send button, or any button that submits the contact form.");
    // await new Promise(r => setTimeout(r, 3000));

    await stagehand.close();

    res.status(200).json({
      success: true,
      businessId,
      message: `Form filled successfully for ${businessName}`,
      formUrl: currentUrl,
      debug: debugLog,
      screenshotBase64: screenshotBase64, // Full screenshot for viewing
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
