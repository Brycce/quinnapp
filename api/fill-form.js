const config = {
  maxDuration: 120,
};

/**
 * Agent trace logger - captures all agent thoughts, actions, and results
 */
class AgentTrace {
  constructor() {
    this.startTime = Date.now();
    this.entries = [];
  }

  log(type, data) {
    const entry = {
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
      type,
      ...data
    };
    this.entries.push(entry);
    // Also console.log for Vercel logs
    console.log(`[AgentTrace] ${type}:`, JSON.stringify(data));
    return entry;
  }

  // Log a decision/thought
  think(thought, context = {}) {
    return this.log('think', { thought, context });
  }

  // Log an observation from Stagehand
  observe(instruction, elements) {
    return this.log('observe', {
      instruction,
      elementCount: elements?.length || 0,
      elements: elements?.map(e => ({
        description: e.description,
        selector: e.selector
      }))
    });
  }

  // Log an action being taken
  act(action, instruction, result = null) {
    return this.log('act', {
      action,
      instruction,
      success: result?.success,
      message: result?.message
    });
  }

  // Log form field filling (deterministic)
  fill(fields, method, values = {}) {
    return this.log('fill', {
      method,
      fieldsAttempted: Object.keys(values),
      fieldsFilled: fields,
      count: fields?.length || 0
    });
  }

  // Log navigation
  navigate(url, trigger) {
    return this.log('navigate', { url, trigger });
  }

  // Log an error
  error(message, context = null) {
    return this.log('error', { message, context });
  }

  // Log a milestone/checkpoint
  milestone(name, data = {}) {
    return this.log('milestone', { name, ...data });
  }

  // Get the full trace
  getTrace() {
    return {
      startTime: new Date(this.startTime).toISOString(),
      duration: Date.now() - this.startTime,
      entryCount: this.entries.length,
      entries: this.entries
    };
  }
}

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
  const trace = new AgentTrace();

  try {
    trace.milestone('init', { website, businessName, businessId });

    // Dynamic imports for ESM modules
    const { Stagehand, AISdkClient } = await import("@browserbasehq/stagehand");
    const { createGroq } = await import("@ai-sdk/groq");
    trace.milestone('imports_loaded');

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
    trace.milestone('stagehand_initialized');

    const page = stagehand.context.pages()[0];

    // Navigate to the business website
    trace.navigate(website, 'initial_navigation');
    await page.goto(website, { waitUntil: "domcontentloaded", timeout: 30000 });
    trace.milestone('page_loaded', { url: page.url() });

    // Try to find and click a booking/quote button (these often open modals or navigate to forms)
    const bookingInstruction = "Look for and click a button or link that says 'Book Now', 'Book Online', 'Schedule Service', 'Get Estimate', 'Get a Quote', 'Request Quote', 'Free Estimate', 'Book an Appointment', or similar booking/quote action. Prefer prominent buttons over footer links. If none found, that's okay.";
    trace.think('Looking for booking/quote button on homepage', { instruction: bookingInstruction });

    const navResult = await stagehand.act(bookingInstruction);
    const clickedBookingButton = navResult?.success && navResult?.message?.includes('performed successfully');
    trace.act('find_booking_button', bookingInstruction, navResult);

    // Wait for page/modal to load (reduced for timeout)
    await new Promise(r => setTimeout(r, 3000));
    trace.milestone('after_booking_click_wait', { url: page.url(), clickedBookingButton });

    // If we successfully clicked a booking button, trust that and proceed to agentic loop
    // The agentic loop has smarter detection for multi-step booking flows (like HouseCall Pro)
    if (!clickedBookingButton) {
      // No booking button was clicked, check if there's a form on the page
      const formObserveInstruction = "Find any contact form, booking form, or input fields on this page.";
      trace.think('No booking button clicked, checking for forms on page');

      const formObservation = await stagehand.observe(formObserveInstruction);
      trace.observe(formObserveInstruction, formObservation);

      if (!formObservation || formObservation.length === 0) {
        trace.milestone('no_form_found', { url: page.url() });
        // Take screenshot before closing
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        const screenshotBase64 = screenshotBuffer.toString('base64');
        await stagehand.close();
        res.status(200).json({
          success: false,
          businessId,
          message: "No contact form found on website",
          trace: trace.getTrace(),
          screenshotBase64: screenshotBase64,
        });
        return;
      }
    }

    trace.milestone('proceeding_to_agentic_loop', { reason: clickedBookingButton ? "booking_button_clicked" : "form_found" });

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
    let iteration = 0;
    const maxIterations = 5; // Reduced for timeout
    let lastCheckboxSignature = null; // Track which checkboxes were available when we last selected

    trace.milestone('starting_agentic_loop', { maxIterations, customerData });

    while (iteration < maxIterations) {
      iteration++;
      trace.milestone(`iteration_${iteration}_start`, { url: page.url() });

      try {
        // 1. OBSERVE: What's on the page?
        const observeInstruction = "Find all interactive elements in this booking form or modal: empty input fields, text areas, dropdown menus, checkboxes (note if each is checked or unchecked), radio buttons (note if selected), service/rate selection buttons, date/time pickers, and navigation buttons. Note which fields are empty vs filled. For checkboxes, explicitly state 'CHECKED' or 'UNCHECKED' for each one.";

        const observations = await stagehand.observe(observeInstruction);
        trace.observe(observeInstruction, observations);

        if (!observations || observations.length === 0) {
          trace.think('No interactive elements found, ending loop');
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

        // Detect checkboxes (for service selection forms)
        const hasCheckbox = obsText.includes('checkbox');
        // Check for any indication that a checkbox is checked
        const hasCheckedCheckbox = obsText.match(/\bchecked\b/i) && !obsText.match(/\bunchecked\b/i) ||
                                   obsText.includes('(checked)') ||
                                   obsText.includes('[checked]') ||
                                   obsText.includes('CHECKED');

        // Create a signature of current checkboxes based on key words
        // This lets us detect when we've moved to a NEW set of checkboxes
        // Use ONLY the count of checkboxes + first significant word from each
        // This is intentionally coarse to avoid LLM format variations
        const checkboxDescriptions = observations
          .filter(o => o.description?.toLowerCase().includes('checkbox'))
          .map(o => {
            // Extract just the first significant word (skip articles, prepositions)
            const cleaned = o.description?.toLowerCase()
              .replace(/checkbox[:\s-]*/gi, '')
              .replace(/\(?(un)?checked\)?/gi, '')
              .replace(/^(for|the|a|an|to)\s+/gi, '')
              .trim();
            // Take first word only
            return cleaned?.split(/\s+/)[0]?.substring(0, 12) || '';
          })
          .filter(s => s && s.length > 2);

        // Signature = count + sorted first words
        const checkboxSignature = `${checkboxDescriptions.length}:${checkboxDescriptions.sort().join(',')}`;

        // Only try to select if:
        // 1. We have checkboxes and none appear checked
        // 2. AND either we haven't selected before OR we're on a DIFFERENT set of checkboxes
        const isNewCheckboxSet = !lastCheckboxSignature || lastCheckboxSignature !== checkboxSignature;
        const shouldSelectCheckbox = hasCheckbox && !hasCheckedCheckbox && isNewCheckboxSet;

        // Detect radio buttons (service type selection)
        const hasRadio = obsText.includes('radio');
        const hasUnselectedRadio = hasRadio && !obsText.includes('selected');

        const hasSelectableService = shouldSelectCheckbox || hasUnselectedRadio;

        // Log decision context
        trace.think('Analyzing observations to decide next action', {
          hasEmptyInput,
          hasAddToBooking,
          hasBookService,
          hasServiceOption,
          hasSelectableService,
          hasCheckbox,
          hasCheckedCheckbox,
          isNewCheckboxSet,
          checkboxSignature: checkboxSignature?.substring(0, 60),
          hasNavButton,
          hasButton,
          observationSummary: obsText.substring(0, 200)
        });

        let action = null;
        let result = null;
        let instruction = null;

        // Priority: 1) Click "Add to booking", 2) Click "Book service", 3) Select service, 4) Fill empty fields, 5) Click nav
        if (hasAddToBooking) {
          instruction = "Click the 'Add to booking' button to proceed.";
          trace.think('Decided to click Add to booking button');
          result = await stagehand.act(instruction);
          action = 'add_to_booking';
          trace.act(action, instruction, result);
        } else if (hasBookService) {
          instruction = "Click the 'Book service' button to proceed to the next step.";
          trace.think('Decided to click Book service button');
          result = await stagehand.act(instruction);
          action = 'book_service';
          trace.act(action, instruction, result);
        } else if (hasServiceOption && !hasEmptyInput) {
          instruction = "Click on a service option, hourly rate button, or service type to select it. Look for buttons showing prices like '$145' or service categories. Do NOT click 'BOOK AN APPOINTMENT' or close buttons.";
          trace.think('Decided to select a service option');
          result = await stagehand.act(instruction);
          action = 'select_service';
          trace.act(action, instruction, result);
        } else if (hasEmptyInput) {
          trace.think('Empty input fields detected, using deterministic form filler');

          // Use deterministic filler to fill ALL visible empty fields at once
          const filledFields = await fillFormFields(page, customerData);

          if (filledFields.length > 0) {
            result = { success: true, message: `Filled ${filledFields.length} fields: ${filledFields.join(', ')}` };
            action = 'fill_deterministic';
            trace.fill(filledFields, 'deterministic', customerData);
          } else {
            // Fallback to AI if deterministic filler found nothing
            instruction = `Fill the first empty input field with appropriate data. Use: firstName=${customerData.firstName}, lastName=${customerData.lastName}, email=${customerData.email}, phone=${customerData.phone}, address=${customerData.address}, description=${customerData.description}`;
            trace.think('Deterministic filler found no fields, falling back to AI');
            result = await stagehand.act(instruction);
            action = 'fill_ai_fallback';
            trace.act(action, instruction, result);
          }
        } else if (hasSelectableService && !hasEmptyInput) {
          // Select a service checkbox/radio that matches the customer's issue
          instruction = `Look at the available options and select one that best matches this customer issue: "${customerData.description}". If you see checkboxes or radio buttons for services, click the most relevant one. If no exact match, select a general option like "Repair", "Service Call", or "Other". Do NOT click navigation buttons like Next, Continue, or Submit.`;
          trace.think('Unchecked service options detected, selecting relevant service');
          result = await stagehand.act(instruction);
          action = 'select_service_option';
          trace.act(action, instruction, result);

          // Remember this checkbox set so we don't re-select on the SAME screen
          // But if checkboxes change (new step), we'll select again
          if (result?.success) {
            lastCheckboxSignature = checkboxSignature;
            // Wait for checkbox state to update in the DOM
            await new Promise(r => setTimeout(r, 1000));
          }
        } else if (hasNavButton || hasButton) {
          instruction = "Click the primary action button to proceed: 'Next', 'Continue', 'Book service', 'Proceed', or 'Submit'. Do NOT click 'BOOK AN APPOINTMENT', close buttons, or back buttons.";
          trace.think('Decided to click navigation/action button');
          result = await stagehand.act(instruction);
          action = 'click_nav';
          trace.act(action, instruction, result);
        } else {
          trace.think('No actionable elements detected, ending loop');
          break;
        }

        trace.milestone(`iteration_${iteration}_complete`, {
          action,
          resultMessage: result?.message
        });

        // Check if we're done
        const resultMsg = (result?.message || '').toLowerCase();
        if (resultMsg.includes('no ') || resultMsg.includes('cannot') || resultMsg.includes('already')) {
          trace.think('Loop completion detected from result message', { resultMsg });
          break;
        }

      } catch (e) {
        trace.error(e.message, `iteration_${iteration}`);
      }

      // Brief wait between iterations for page updates
      await new Promise(r => setTimeout(r, 500));
    }

    trace.milestone('agentic_loop_finished', { totalIterations: iteration });

    // Brief pause to let any animations settle
    await new Promise(r => setTimeout(r, 500));

    // Take screenshot of current state (don't scroll - we want to see the form/modal)
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString('base64');
    trace.milestone('screenshot_taken');

    // Get current URL
    const currentUrl = page.url();
    trace.milestone('complete', { finalUrl: currentUrl });

    // TODO: Uncomment to actually submit forms in production
    // await stagehand.act("Click the submit button, send button, or any button that submits the contact form.");
    // await new Promise(r => setTimeout(r, 3000));

    await stagehand.close();

    res.status(200).json({
      success: true,
      businessId,
      message: `Form filled successfully for ${businessName}`,
      formUrl: currentUrl,
      trace: trace.getTrace(),
      screenshotBase64: screenshotBase64,
    });

  } catch (error) {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {}
    }

    trace.error(error.message, error.stack?.substring(0, 300));
    console.error("Form fill error:", error);

    res.status(200).json({
      success: false,
      businessId,
      message: error.message || "Form filling failed",
      trace: trace.getTrace(),
    });
  }
};

module.exports.config = config;
