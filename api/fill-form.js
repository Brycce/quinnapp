const config = {
  maxDuration: 120,
};

/**
 * Deterministic form filler - fills all visible empty form fields at once
 * Uses Playwright locators to find fields by common patterns (name, id, placeholder, type)
 * @param {Page|Frame} context - Playwright page or frame to fill
 * @param {Object} customerData - Customer data object with field values
 * @returns {Promise<string[]>} - Array of field names that were filled
 */
async function fillFormFieldsInContext(context, customerData) {
  const filled = [];

  // Simplified field mappings - fewer patterns, faster matching
  const fieldMappings = [
    { name: 'firstName', selectors: ['input[name*="first" i]', 'input[id*="first" i]'], value: customerData.firstName },
    { name: 'lastName', selectors: ['input[name*="last" i]', 'input[id*="last" i]'], value: customerData.lastName },
    { name: 'email', selectors: ['input[type="email"]', 'input[name*="email" i]'], value: customerData.email },
    { name: 'phone', selectors: ['input[type="tel"]', 'input[name*="phone" i]'], value: customerData.phone },
    { name: 'address', selectors: ['input[name*="address" i]', 'input[name*="street" i]'], value: customerData.address },
    { name: 'city', selectors: ['input[name*="city" i]'], value: customerData.city },
    { name: 'zip', selectors: ['input[name*="zip" i]', 'input[name*="postal" i]'], value: customerData.postalCode },
    { name: 'description', selectors: ['textarea[name*="description" i]', 'textarea[name*="message" i]', 'textarea[name*="detail" i]', 'textarea'], value: customerData.description },
  ];

  for (const mapping of fieldMappings) {
    if (!mapping.value) continue;

    for (const selector of mapping.selectors) {
      try {
        const locator = context.locator(selector).first();
        // Quick check - count first (faster than isVisible)
        const count = await locator.count().catch(() => 0);
        if (count === 0) continue;

        // Check if already filled
        const currentValue = await locator.inputValue().catch(() => '');
        if (currentValue && currentValue.trim() !== '') continue;

        // Fill the field
        await locator.fill(mapping.value);
        filled.push(mapping.name);
        break;
      } catch {
        // Continue to next selector
      }
    }
  }

  return filled;
}

/**
 * Fill form fields across main page and iframes
 */
async function fillFormFields(page, customerData) {
  // Try main page first
  let filled = await fillFormFieldsInContext(page, customerData);

  // If nothing filled in main page, try iframes
  if (filled.length === 0) {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue; // Skip main frame, already tried
      try {
        filled = await fillFormFieldsInContext(frame, customerData);
        if (filled.length > 0) break; // Found fields in this frame
      } catch {
        // Frame not accessible, continue
      }
    }
  }

  return filled;
}

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
    const navResult = await stagehand.act("Look for and click a button or link that says 'Book Now', 'Book Online', 'Schedule Service', 'Get Estimate', 'Get a Quote', 'Request Quote', 'Free Estimate', 'Book an Appointment', or similar booking/quote action. Prefer prominent buttons over footer links. If none found, that's okay.");
    const clickedBookingButton = navResult?.success && navResult?.message?.includes('performed successfully');
    debugLog.push({ step: "nav_to_booking", result: navResult, clickedBookingButton, time: Date.now() });

    // Wait for page/modal to load (reduced for timeout)
    await new Promise(r => setTimeout(r, 3000));
    debugLog.push({ step: "after_wait", url: page.url(), time: Date.now() });

    // If we successfully clicked a booking button, trust that and proceed to agentic loop
    // The agentic loop has smarter detection for multi-step booking flows (like HouseCall Pro)
    if (!clickedBookingButton) {
      // No booking button was clicked, check if there's a form on the page
      const formObservation = await stagehand.observe("Find any contact form, booking form, or input fields on this page.");
      debugLog.push({ step: "observe_form", found: formObservation?.length || 0, time: Date.now() });

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
    }

    debugLog.push({ step: "proceeding_to_agentic_loop", reason: clickedBookingButton ? "booking_button_clicked" : "form_found", time: Date.now() });

    // Customer data for form filling (object for deterministic filler)
    const customerData = {
      firstName: serviceRequest.customerName.split(' ')[0],
      lastName: serviceRequest.customerName.split(' ').slice(1).join(' ') || 'Customer',
      email: 'quinn@getquinn.ai',
      phone: serviceRequest.phoneCallback || '250-555-0123',
      address: serviceRequest.location,
      city: 'Victoria',
      postalCode: 'V8N 5C1',
      state: 'BC',
      description: serviceRequest.description
    };

    // Agentic loop using observe → decide → act pattern
    const iterationResults = [];
    let iteration = 0;
    const maxIterations = 5; // Reduced for timeout

    debugLog.push({ step: "starting_agentic_loop", maxIterations, time: Date.now() });

    while (iteration < maxIterations) {
      iteration++;
      debugLog.push({ step: `iteration_${iteration}_start`, time: Date.now() });

      try {
        // 1. OBSERVE: What's on the page?
        const observations = await stagehand.observe(
          "Find all interactive elements in this booking form or modal: empty input fields, text areas, dropdown menus, service/rate selection buttons, date/time pickers, and navigation buttons. Note which fields are empty vs filled. Look for options like 'Hourly Rate', service type buttons, or selectable service options."
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
        const obsText = observations.map(o => o.description).join(', ').toLowerCase();

        // Detect truly empty fields (not filled/pre-filled ones)
        const hasEmptyInput = obsText.includes('empty') ||
                              (obsText.includes('input') && !obsText.includes('filled')) ||
                              (obsText.includes('textbox') && !obsText.includes('filled') && !obsText.includes('pre-filled'));
        const hasAddToBooking = obsText.includes('add to booking');
        const hasBookService = obsText.includes('book service');
        const hasServiceOption = (obsText.includes('rate') || obsText.includes('hourly') || obsText.includes('service type') || obsText.includes('$')) && !hasAddToBooking && !hasBookService;
        const hasNavButton = obsText.includes('next') || obsText.includes('continue') || obsText.includes('proceed') || obsText.includes('submit');
        const hasButton = obsText.includes('button');

        let action = null;
        let result = null;

        // Priority: 1) Click "Add to booking", 2) Click "Book service", 3) Select service, 4) Fill empty fields, 5) Click nav
        if (hasAddToBooking) {
          result = await stagehand.act("Click the 'Add to booking' button to proceed.");
          action = 'add_to_booking';
        } else if (hasBookService) {
          result = await stagehand.act("Click the 'Book service' button to proceed to the next step.");
          action = 'book_service';
        } else if (hasServiceOption && !hasEmptyInput) {
          result = await stagehand.act(
            "Click on a service option, hourly rate button, or service type to select it. Look for buttons showing prices like '$145' or service categories. Do NOT click 'BOOK AN APPOINTMENT' or close buttons."
          );
          action = 'select_service';
        } else if (hasEmptyInput) {
          // Use deterministic filler to fill ALL visible empty fields at once
          const filledFields = await fillFormFields(page, customerData);

          if (filledFields.length > 0) {
            result = { success: true, message: `Filled ${filledFields.length} fields: ${filledFields.join(', ')}` };
            action = 'fill_all';
          } else {
            // Fallback to AI if deterministic filler found nothing
            result = await stagehand.act(
              `Fill the first empty input field with appropriate data. Use: firstName=${customerData.firstName}, lastName=${customerData.lastName}, email=${customerData.email}, phone=${customerData.phone}, address=${customerData.address}, description=${customerData.description}`
            );
            action = 'fill_ai_fallback';
          }
        } else if (hasNavButton || hasButton) {
          result = await stagehand.act(
            "Click the primary action button to proceed: 'Next', 'Continue', 'Book service', 'Proceed', or 'Submit'. Do NOT click 'BOOK AN APPOINTMENT', close buttons, or back buttons."
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
      await new Promise(r => setTimeout(r, 500));
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
