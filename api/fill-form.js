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
    await new Promise(r => setTimeout(r, 3000));
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

    // Fill the form - handle both standard contact forms and booking widgets
    const fillResults = [];

    // First, check if this is a booking widget with service/date/time selectors
    const isBookingWidget = formObservation.some(obs =>
      obs.description?.toLowerCase().includes('date') ||
      obs.description?.toLowerCase().includes('time') ||
      obs.description?.toLowerCase().includes('booking') ||
      obs.description?.toLowerCase().includes('schedule')
    );

    debugLog.push({ step: "form_type", isBookingWidget, time: Date.now() });

    if (isBookingWidget) {
      // Handle HouseCall Pro style booking widget with 4-step flow:
      // Step 1: Service Selection → "Add to booking"
      // Step 2: Description → "Book service"
      // Step 3: Contact Details (name, email, phone, address) → "Next"
      // Step 4: Arrival Window (date/time)

      // === STEP 1: Select service and click "Add to booking" ===
      try {
        const serviceResult = await stagehand.act("Inside the booking modal or popup dialog, click on a service option card or tile. Look for clickable boxes with service names and prices. Do NOT click on navigation menu items. Click inside the modal/popup only.");
        fillResults.push({ field: "step1_service_selection", result: serviceResult });
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        fillResults.push({ field: "step1_service_selection", skipped: true, error: e.message });
      }

      // Click "Add to booking" button to proceed to step 2
      try {
        const addResult = await stagehand.act("Click the 'Add to booking' button inside the modal");
        fillResults.push({ field: "step1_add_to_booking", result: addResult });
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        fillResults.push({ field: "step1_add_to_booking", skipped: true, error: e.message });
      }

      // === STEP 2: Fill description and click "Book service" ===
      try {
        const descResult = await stagehand.act(`Type "${serviceRequest.description}" into the description or message text area inside the modal`);
        fillResults.push({ field: "step2_description", result: descResult });
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        fillResults.push({ field: "step2_description", skipped: true, error: e.message });
      }

      // Click "Book service" button to proceed to step 3
      try {
        const bookResult = await stagehand.act("Click the 'Book service' button inside the modal");
        fillResults.push({ field: "step2_book_service", result: bookResult });
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        fillResults.push({ field: "step2_book_service", skipped: true, error: e.message });
      }

      // === STEP 3: Fill contact details ===
      // First name
      try {
        const firstNameResult = await stagehand.act(`Type "${serviceRequest.customerName.split(' ')[0]}" into the First name input field`);
        fillResults.push({ field: "step3_first_name", result: firstNameResult });
      } catch (e) {
        fillResults.push({ field: "step3_first_name", skipped: true, error: e.message });
      }

      // Last name
      try {
        const lastNameResult = await stagehand.act(`Type "${serviceRequest.customerName.split(' ').slice(1).join(' ') || 'Customer'}" into the Last name input field`);
        fillResults.push({ field: "step3_last_name", result: lastNameResult });
      } catch (e) {
        fillResults.push({ field: "step3_last_name", skipped: true, error: e.message });
      }

      // Phone
      try {
        const phoneResult = await stagehand.act(`Type "${serviceRequest.phoneCallback || '250-555-0123'}" into the Phone number input field`);
        fillResults.push({ field: "step3_phone", result: phoneResult });
      } catch (e) {
        fillResults.push({ field: "step3_phone", skipped: true, error: e.message });
      }

      // Email - CRITICAL field
      try {
        const emailResult = await stagehand.act("Type \"quinn@getquinn.ai\" into the Email input field");
        fillResults.push({ field: "step3_email", result: emailResult });
      } catch (e) {
        // Retry with different approach
        try {
          const emailRetry = await stagehand.act("Click on the email field and enter quinn@getquinn.ai");
          fillResults.push({ field: "step3_email", result: emailRetry });
        } catch (e2) {
          fillResults.push({ field: "step3_email", skipped: true, error: e2.message });
        }
      }

      // Address
      try {
        const addressResult = await stagehand.act(`Type "${serviceRequest.location}" into the Address input field`);
        fillResults.push({ field: "step3_address", result: addressResult });
      } catch (e) {
        fillResults.push({ field: "step3_address", skipped: true, error: e.message });
      }

      // City
      try {
        const cityResult = await stagehand.act("Type \"Victoria\" into the City input field");
        fillResults.push({ field: "step3_city", result: cityResult });
      } catch (e) {
        fillResults.push({ field: "step3_city", skipped: true, error: e.message });
      }

      // Zip/Postal Code
      try {
        const zipResult = await stagehand.act("Type \"V8N 5C1\" into the Zip or Postal code input field");
        fillResults.push({ field: "step3_zip", result: zipResult });
      } catch (e) {
        fillResults.push({ field: "step3_zip", skipped: true, error: e.message });
      }

      // Click "Next" to proceed to step 4
      try {
        const nextResult = await stagehand.act("Click the 'Next' button to proceed to arrival window selection");
        fillResults.push({ field: "step3_next", result: nextResult });
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        fillResults.push({ field: "step3_next", skipped: true, error: e.message });
      }

      // === STEP 4: Select arrival window ===
      try {
        const dateResult = await stagehand.act("Click on the next available date in the calendar");
        fillResults.push({ field: "step4_date", result: dateResult });
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        fillResults.push({ field: "step4_date", skipped: true, error: e.message });
      }

      try {
        const timeResult = await stagehand.act("Click on any available time slot");
        fillResults.push({ field: "step4_time", result: timeResult });
      } catch (e) {
        fillResults.push({ field: "step4_time", skipped: true, error: e.message });
      }
    }

    // Standard fields - works for both form types

    // Fill name field
    try {
      const nameResult = await stagehand.act(`Type "${serviceRequest.customerName}" into the name input field`);
      fillResults.push({ field: "name", result: nameResult });
    } catch (e) {
      fillResults.push({ field: "name", skipped: true, error: e.message });
    }

    // Fill email field - try multiple approaches
    try {
      const emailResult = await stagehand.act(`Find the email address input field and type "quinn@getquinn.ai" into it`);
      fillResults.push({ field: "email", result: emailResult });
    } catch (e) {
      // Retry with different wording
      try {
        const emailRetry = await stagehand.act(`Click on the email field and enter quinn@getquinn.ai`);
        fillResults.push({ field: "email", result: emailRetry });
      } catch (e2) {
        fillResults.push({ field: "email", skipped: true, error: e2.message });
      }
    }

    // Fill phone field
    try {
      const phoneResult = await stagehand.act(`Type "${serviceRequest.phoneCallback || '250-555-0123'}" into the phone number input field`);
      fillResults.push({ field: "phone", result: phoneResult });
    } catch (e) {
      fillResults.push({ field: "phone", skipped: true, error: e.message });
    }

    // Fill address field
    try {
      const addressResult = await stagehand.act(`Type "${serviceRequest.location}" into the address or location input field`);
      fillResults.push({ field: "address", result: addressResult });
    } catch (e) {
      fillResults.push({ field: "address", skipped: true, error: e.message });
    }

    // Fill message/description field
    try {
      const messageResult = await stagehand.act(`Type the following message into the description or notes textarea: "${message}"`);
      fillResults.push({ field: "message", result: messageResult });
    } catch (e) {
      fillResults.push({ field: "message", skipped: true, error: e.message });
    }

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
      errorStack: error.stack?.substring(0, 500),
      debug: debugLog || [],
    });
  }
};

module.exports.config = config;
