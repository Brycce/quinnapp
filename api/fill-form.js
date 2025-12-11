const config = {
  maxDuration: 120,
};

/**
 * Simple trace logger
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
    console.log(`[AgentTrace] ${type}:`, JSON.stringify(data));
    return entry;
  }

  milestone(name, data = {}) {
    return this.log('milestone', { name, ...data });
  }

  error(message, context = null) {
    return this.log('error', { message, context });
  }

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
 * Main handler - uses Stagehand's native agent for form filling
 */
module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({
      status: "ok",
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
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
  const { businessId, businessName, website, serviceRequest, trackingToken } = body || {};

  if (!website || !serviceRequest) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Generate unique email for this request
  // If trackingToken provided, use it for routing responses back to the right request
  // Using quotes.callquinn.com subdomain to separate tracking emails from regular emails
  const requestEmail = trackingToken
    ? `${trackingToken}@quotes.callquinn.com`
    : 'quinn@getquinn.ai';

  let stagehand = null;
  const trace = new AgentTrace();

  try {
    trace.milestone('init', { website, businessName, businessId });

    // Dynamic imports for ESM modules
    const { Stagehand } = await import("@browserbasehq/stagehand");
    trace.milestone('imports_loaded');

    // Customer data for form filling
    const customerData = {
      firstName: serviceRequest.customerName.split(' ')[0],
      lastName: serviceRequest.customerName.split(' ').slice(1).join(' ') || 'Customer',
      email: requestEmail,  // Use tracking token email for routing responses
      phone: serviceRequest.phoneCallback || '250-555-0123',
      address: serviceRequest.location,
      city: 'Victoria',
      postalCode: 'V8N 5C1',
      state: 'BC',
      description: serviceRequest.description
    };

    trace.milestone('customer_data', { email: requestEmail, trackingToken });

    // Initialize Stagehand with Browserbase
    // Using default OpenAI model - Stagehand handles the LLM integration
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      enableCaching: false,
      disablePino: true,
      modelName: "gpt-4o",
      modelApiKey: process.env.OPENAI_API_KEY,
      browserbaseSessionCreateParams: {
        browserSettings: {
          solveCaptchas: true,
        },
      },
    });

    await stagehand.init();
    trace.milestone('stagehand_initialized');

    // In Stagehand v3, page is accessed via context.pages()[0]
    const page = stagehand.context.pages()[0];

    // Navigate to the business website
    trace.milestone('navigating', { url: website });
    await page.goto(website);
    trace.milestone('page_loaded', { url: page.url() });

    // Use Stagehand's native agent for autonomous form filling
    trace.milestone('starting_agent');

    // Agent inherits model config from Stagehand instance
    // Can override with model: { modelName, apiKey } if needed
    const agent = stagehand.agent({
      model: {
        modelName: "openai/gpt-4o",
        apiKey: process.env.OPENAI_API_KEY,
      },
    });

    // Execute the form-filling task
    const result = await agent.execute(
      `Fill out this service request form for a plumbing company.

CUSTOMER INFORMATION:
- First Name: ${customerData.firstName}
- Last Name: ${customerData.lastName}
- Email: ${customerData.email}
- Phone: ${customerData.phone}
- Address: ${customerData.address}
- City: ${customerData.city}
- Postal Code: ${customerData.postalCode}
- Service Needed: ${customerData.description}

INSTRUCTIONS:
1. Navigate through any multi-step forms by clicking "Next", "Continue", or similar buttons
2. If there are service type options (checkboxes, radio buttons, dropdowns), select the one that best matches "${customerData.description}"
3. Fill in all contact information fields (name, email, phone, address) with the customer data above
4. IMPORTANT: Do NOT click the final "Submit" button - stop after filling all fields
5. If you encounter a popup or modal, interact with it appropriately

Complete the task when all contact fields are filled. Do not submit the form.`,
      {
        maxSteps: 15,
      }
    );

    trace.milestone('agent_complete', {
      success: result.success,
      message: result.message,
      steps: result.steps?.length || 0
    });

    // Take screenshot
    await new Promise(r => setTimeout(r, 500));
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString('base64');
    trace.milestone('screenshot_taken');

    const currentUrl = page.url();
    trace.milestone('complete', { finalUrl: currentUrl });

    await stagehand.close();

    res.status(200).json({
      success: result.success !== false,
      businessId,
      message: `Form filling completed for ${businessName}`,
      formUrl: currentUrl,
      agentResult: {
        success: result.success,
        message: result.message,
        steps: result.steps?.length || 0,
      },
      trace: trace.getTrace(),
      screenshotBase64: screenshotBase64,
    });

  } catch (error) {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {}
    }

    trace.error(error.message, error.stack?.substring(0, 500));
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
