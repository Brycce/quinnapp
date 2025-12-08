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
  const debugLog = [];

  try {
    debugLog.push({ step: "init", time: Date.now() });

    // Dynamic imports for ESM modules
    const { Stagehand, AISdkClient } = await import("@browserbasehq/stagehand");
    const { createGroq } = await import("@ai-sdk/groq");
    debugLog.push({ step: "imports_loaded", time: Date.now() });

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

    // Try to find and click a booking/quote button (these often open modals or navigate to forms)
    const navResult = await stagehand.act("Look for and click a button or link that says 'Book Now', 'Book Online', 'Schedule Service', 'Get Estimate', 'Get a Quote', 'Request Quote', 'Free Estimate', or similar booking/quote action. Prefer prominent buttons over footer links. If none found, that's okay.");
    debugLog.push({ step: "nav_to_booking", result: navResult, time: Date.now() });

    // Wait for page/modal to load (modals may have animations)
    await new Promise(r => setTimeout(r, 5000));
    debugLog.push({ step: "after_wait", url: page.url(), time: Date.now() });

    // Check if there's a contact form, modal, or booking widget on this page
    // Stagehand v3 handles iframes automatically
    const formObservation = await stagehand.observe("Find any contact form, booking form, quote request form, or popup modal on this page. Look for input fields like name, email, phone, message, address, or description. Also check for iframe booking widgets.");
    debugLog.push({ step: "observe_form", found: formObservation?.length || 0, observation: formObservation, time: Date.now() });

    // Check if form is inside an iframe (for logging)
    const hasIframe = formObservation?.some(obs => obs.selector?.includes('iframe'));
    debugLog.push({ step: "iframe_check", hasIframe, time: Date.now() });

    if (!formObservation || formObservation.length === 0) {
      // Take screenshot before closing
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      const screenshotBase64 = screenshotBuffer.toString('base64');
      await stagehand.close();
      res.status(200).json({
        success: false,
        businessId,
        message: "No contact form found on website",
        debug: debugLog,
        screenshotBase64: screenshotBase64,
      });
      return;
    }

    // Customer data for form filling
    const customerData = `
First Name: ${serviceRequest.customerName.split(' ')[0]}
Last Name: ${serviceRequest.customerName.split(' ').slice(1).join(' ') || 'Customer'}
Email: quinn@getquinn.ai
Phone: ${serviceRequest.phoneCallback || '250-555-0123'}
Address: ${serviceRequest.location}
City: Victoria
Postal Code: V8N 5C1
Description: ${serviceRequest.description}
`;

    // Agentic loop using observe → decide → act pattern
    const iterationResults = [];
    let iteration = 0;
    const maxIterations = 6; // Reduced for timeout

    debugLog.push({ step: "starting_agentic_loop", maxIterations, time: Date.now() });

    while (iteration < maxIterations) {
      iteration++;
      debugLog.push({ step: `iteration_${iteration}_start`, time: Date.now() });

      try {
        // 1. OBSERVE: What's on the page?
        const observations = await stagehand.observe(
          "Find all interactive elements: empty input fields, text areas, dropdown menus, clickable buttons, and date/time pickers. Note which fields are empty vs filled."
        );

        debugLog.push({
          step: `iteration_${iteration}_observed`,
          elements: observations?.length || 0,
          types: observations?.map(o => o.description?.substring(0, 50)),
          time: Date.now()
        });

        if (!observations || observations.length === 0) {
          debugLog.push({ step: "no_elements_found", iteration, time: Date.now() });
          break;
        }

        // 2. DECIDE: What action to take based on observations
        const obsText = observations.map(o => o.description).join(', ');
        const hasEmptyInput = obsText.toLowerCase().includes('empty') ||
                              obsText.toLowerCase().includes('input') ||
                              obsText.toLowerCase().includes('text');
        const hasButton = obsText.toLowerCase().includes('button');

        let action = null;
        let result = null;

        // Priority: fill empty fields first, then click buttons
        if (hasEmptyInput) {
          // 3. ACT: Fill the next empty field
          result = await stagehand.act(
            `Type the appropriate value into the first empty input field. Use: firstName=%firstName%, lastName=%lastName%, email=%email%, phone=%phone%, address=%address%, description=%description%`,
            {
              variables: {
                firstName: serviceRequest.customerName.split(' ')[0],
                lastName: serviceRequest.customerName.split(' ').slice(1).join(' ') || 'Customer',
                email: 'quinn@getquinn.ai',
                phone: serviceRequest.phoneCallback || '250-555-0123',
                address: serviceRequest.location,
                description: serviceRequest.description
              }
            }
          );
          action = 'fill';
        } else if (hasButton) {
          // 3. ACT: Click the next/continue button
          result = await stagehand.act(
            "Click the primary navigation button (like 'Next', 'Continue', 'Add to booking', or 'Book service'). Do NOT click final submit or confirm buttons."
          );
          action = 'click';
        } else {
          debugLog.push({ step: "no_actionable_elements", iteration, time: Date.now() });
          break;
        }

        iterationResults.push({
          iteration,
          action,
          result: result?.message || 'action taken',
          time: Date.now()
        });

        debugLog.push({
          step: `iteration_${iteration}_complete`,
          action,
          result: result?.message?.substring(0, 100),
          time: Date.now()
        });

        // Check if we're done
        const resultMsg = (result?.message || '').toLowerCase();
        if (resultMsg.includes('no ') || resultMsg.includes('cannot') || resultMsg.includes('already')) {
          debugLog.push({ step: "loop_complete_detected", iteration, time: Date.now() });
          break;
        }

      } catch (e) {
        iterationResults.push({
          iteration,
          error: e.message,
          time: Date.now()
        });
        debugLog.push({
          step: `iteration_${iteration}_error`,
          error: e.message?.substring(0, 100),
          time: Date.now()
        });
      }

      // Brief wait between iterations for page updates
      await new Promise(r => setTimeout(r, 1000));
    }

    debugLog.push({ step: "agentic_loop_finished", totalIterations: iteration, results: iterationResults, time: Date.now() });

    // Brief pause to let any animations settle
    await new Promise(r => setTimeout(r, 500));

    // Take screenshot of current state (don't scroll - we want to see the form/modal)
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
      errorStack: error.stack?.substring(0, 500),
      debug: debugLog || [],
    });
  }
};

module.exports.config = config;
