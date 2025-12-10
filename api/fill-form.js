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
    console.log(`[AgentTrace] ${type}:`, JSON.stringify(data));
    return entry;
  }

  toolCall(toolName, params) {
    return this.log('tool_call', { tool: toolName, params });
  }

  toolResult(toolName, result) {
    return this.log('tool_result', { tool: toolName, result });
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
 * Tool definitions for Groq API
 */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_page_state",
      description: "Get current page state including all form elements. Call this first to see what's on the page.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description: "Click a button, link, or interactive element on the page",
      parameters: {
        type: "object",
        properties: {
          element: {
            type: "string",
            description: "Description of the element to click (e.g., 'Next button', 'Submit', 'Get a Quote')"
          }
        },
        required: ["element"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "select_option",
      description: "Select a checkbox, radio button, or dropdown option. Use this for service selection.",
      parameters: {
        type: "object",
        properties: {
          option: {
            type: "string",
            description: "The option to select (e.g., 'Faucet Repair', 'Plumbing Service')"
          }
        },
        required: ["option"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fill_form_fields",
      description: "Fill all visible empty form fields with customer data. Use this when you see input fields for name, email, phone, etc.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Mark the task as complete. Call this when the form has been submitted or you cannot proceed further.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["success", "failed"],
            description: "Whether the form was successfully submitted"
          },
          message: {
            type: "string",
            description: "Brief explanation of what happened"
          }
        },
        required: ["status", "message"]
      }
    }
  }
];

/**
 * Execute a tool call using Stagehand/Playwright
 */
async function executeToolCall(toolName, params, { stagehand, page, customerData, trace }) {
  trace.toolCall(toolName, params);

  let result;

  switch (toolName) {
    case "get_page_state": {
      const observations = await stagehand.observe(
        "List all interactive form elements on this page: checkboxes (note if CHECKED or UNCHECKED), radio buttons (note if selected), input fields (note if empty or filled), text areas, dropdown menus, and buttons. Be specific about the state of each element."
      );
      result = {
        url: page.url(),
        elements: observations.map(o => o.description),
        elementCount: observations.length
      };
      break;
    }

    case "click_element": {
      const clickResult = await stagehand.act(`Click: ${params.element}`);
      // Wait for page to update
      await new Promise(r => setTimeout(r, 1500));
      result = {
        success: clickResult?.success ?? true,
        message: clickResult?.message || `Clicked ${params.element}`
      };
      break;
    }

    case "select_option": {
      const selectResult = await stagehand.act(`Select the option: ${params.option}. Click on the checkbox or radio button for this option.`);
      // Wait for selection to register
      await new Promise(r => setTimeout(r, 1000));
      result = {
        success: selectResult?.success ?? true,
        message: selectResult?.message || `Selected ${params.option}`
      };
      break;
    }

    case "fill_form_fields": {
      const filled = await fillFormFields(page, customerData);
      result = {
        success: filled.length > 0,
        fieldsFilled: filled,
        message: filled.length > 0
          ? `Filled ${filled.length} fields: ${filled.join(', ')}`
          : "No empty fields found to fill"
      };
      break;
    }

    case "done": {
      result = {
        done: true,
        status: params.status,
        message: params.message
      };
      break;
    }

    default:
      result = { error: `Unknown tool: ${toolName}` };
  }

  trace.toolResult(toolName, result);
  return result;
}

/**
 * Deterministic form filler - fills all visible empty form fields at once
 */
async function fillFormFieldsInContext(context, customerData) {
  const filled = [];

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
        const count = await locator.count().catch(() => 0);
        if (count === 0) continue;

        const currentValue = await locator.inputValue().catch(() => '');
        if (currentValue && currentValue.trim() !== '') continue;

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
  let filled = await fillFormFieldsInContext(page, customerData);

  if (filled.length === 0) {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;
      try {
        filled = await fillFormFieldsInContext(frame, customerData);
        if (filled.length > 0) break;
      } catch {
        // Frame not accessible
      }
    }
  }

  return filled;
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
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
    const Groq = (await import("groq-sdk")).default;
    trace.milestone('imports_loaded');

    // Create Groq client for Stagehand (for observe/act)
    const groqProvider = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const groqClient = new AISdkClient({
      model: groqProvider("meta-llama/llama-4-maverick-17b-128e-instruct"),
    });

    // Create Groq client for tool calling
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    // Initialize Stagehand with Browserbase
    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      llmClient: groqClient,
      enableCaching: false,
      verbose: 2,
      disablePino: true,
      browserbaseSessionCreateParams: {
        browserSettings: {
          solveCaptchas: true,
        },
      },
    });

    await stagehand.init();
    trace.milestone('stagehand_initialized');

    const page = stagehand.context.pages()[0];

    // Navigate to the business website
    trace.milestone('navigating', { url: website });
    await page.goto(website, { waitUntil: "domcontentloaded", timeout: 30000 });
    trace.milestone('page_loaded', { url: page.url() });

    // Customer data for form filling
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

    // System prompt for the agent - keep it simple and directive
    const systemPrompt = `You are a form-filling agent. Your goal is to fill out a service request form on a plumbing website.

CUSTOMER INFO:
Name: ${customerData.firstName} ${customerData.lastName}
Service needed: ${customerData.description}
Phone: ${customerData.phone}
Email: ${customerData.email}
Address: ${customerData.address}

AVAILABLE TOOLS:
- get_page_state() - See what's on the current page
- click_element(element) - Click buttons like "Get a Quote", "Next", "Submit"
- select_option(option) - Select a service checkbox matching the customer's need
- fill_form_fields() - Fill all empty contact fields with customer data
- done(status, message) - Call when finished (status: "success" or "failed")

Start by calling get_page_state() to see the page.`;

    // Initialize conversation history with a user message to kick things off
    const conversationHistory = [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Please fill out the form on this page with the customer information. Start by examining the page." }
    ];

    // Agent loop
    let iteration = 0;
    const maxIterations = 12;
    let isDone = false;

    trace.milestone('starting_agent_loop', { maxIterations });

    while (iteration < maxIterations && !isDone) {
      iteration++;
      trace.milestone(`iteration_${iteration}_start`);

      try {
        // Get LLM to decide which tool to call
        const response = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: conversationHistory,
          tools: TOOLS,
          tool_choice: "required"
        });

        const assistantMessage = response.choices[0].message;
        conversationHistory.push(assistantMessage);

        // Check if we got tool calls
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          trace.error('No tool call in response', { message: assistantMessage.content });
          break;
        }

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const params = JSON.parse(toolCall.function.arguments || '{}');

          // Execute the tool
          const result = await executeToolCall(toolName, params, {
            stagehand,
            page,
            customerData,
            trace
          });

          // Add tool result to conversation
          conversationHistory.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });

          // Check if done
          if (result.done) {
            isDone = true;
            trace.milestone('agent_done', { status: result.status, message: result.message });
            break;
          }
        }

        trace.milestone(`iteration_${iteration}_complete`);

      } catch (e) {
        trace.error(`Iteration ${iteration} error: ${e.message}`);
        // Continue to next iteration
      }
    }

    trace.milestone('agent_loop_finished', { totalIterations: iteration, isDone });

    // Take screenshot
    await new Promise(r => setTimeout(r, 500));
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshotBuffer.toString('base64');
    trace.milestone('screenshot_taken');

    const currentUrl = page.url();
    trace.milestone('complete', { finalUrl: currentUrl });

    await stagehand.close();

    res.status(200).json({
      success: isDone,
      businessId,
      message: `Form filling ${isDone ? 'completed' : 'reached max iterations'} for ${businessName}`,
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
