const config = {
  maxDuration: 120,
};

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({
      status: "ok",
      description: "POST to this endpoint to test CAPTCHA solving",
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

  let stagehand = null;
  const debugLog = [];

  try {
    const { Stagehand, AISdkClient } = await import("@browserbasehq/stagehand");
    const { createGroq } = await import("@ai-sdk/groq");

    const groqProvider = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const groqClient = new AISdkClient({
      model: groqProvider("openai/gpt-oss-120b"),
    });

    debugLog.push({ step: "init", time: Date.now() });

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
    debugLog.push({ step: "stagehand_initialized", time: Date.now() });

    const page = stagehand.context.pages()[0];

    // Listen for CAPTCHA solving events
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("browserbase-solving")) {
        debugLog.push({ step: "captcha_event", message: text, time: Date.now() });
      }
    });

    // Navigate to Google reCAPTCHA demo page
    await page.goto("https://www.google.com/recaptcha/api2/demo", {
      waitUntil: "networkidle",
      timeout: 30000
    });
    debugLog.push({ step: "navigated_to_demo", url: page.url(), time: Date.now() });

    // Take screenshot before attempting CAPTCHA
    const beforeScreenshot = await page.screenshot();
    const beforeBase64 = beforeScreenshot.toString('base64');
    debugLog.push({ step: "screenshot_before", time: Date.now() });

    // Try to click the reCAPTCHA checkbox
    // The checkbox is in an iframe, so we need to handle that
    const clickResult = await stagehand.act("Click the reCAPTCHA checkbox that says 'I'm not a robot'");
    debugLog.push({ step: "clicked_checkbox", result: clickResult, time: Date.now() });

    // Wait for CAPTCHA solving (up to 45 seconds)
    debugLog.push({ step: "waiting_for_captcha", time: Date.now() });
    await new Promise(r => setTimeout(r, 10000));

    // Take another screenshot to see state
    const midScreenshot = await page.screenshot();
    const midBase64 = midScreenshot.toString('base64');
    debugLog.push({ step: "screenshot_mid", time: Date.now() });

    // Wait more if needed
    await new Promise(r => setTimeout(r, 20000));

    // Try to submit the form
    const submitResult = await stagehand.act("Click the Submit button to submit the form");
    debugLog.push({ step: "clicked_submit", result: submitResult, time: Date.now() });

    // Wait for result page
    await new Promise(r => setTimeout(r, 3000));
    debugLog.push({ step: "after_submit_wait", url: page.url(), time: Date.now() });

    // Take final screenshot
    const afterScreenshot = await page.screenshot({ fullPage: true });
    const afterBase64 = afterScreenshot.toString('base64');
    debugLog.push({ step: "screenshot_after", time: Date.now() });

    // Check if we're on the success page
    const pageContent = await page.content();
    const success = pageContent.includes("Verification Success") ||
                    pageContent.includes("score") ||
                    page.url().includes("action=demo");

    await stagehand.close();

    res.status(200).json({
      success,
      message: success ? "CAPTCHA solved successfully!" : "CAPTCHA may not have been solved",
      debug: debugLog,
      screenshots: {
        before: beforeBase64.substring(0, 200) + "...",
        mid: midBase64.substring(0, 200) + "...",
        after: afterBase64.substring(0, 200) + "...",
      },
      fullScreenshotAfter: afterBase64,
    });

  } catch (error) {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {}
    }

    console.error("CAPTCHA test error:", error);
    res.status(200).json({
      success: false,
      message: error.message || "CAPTCHA test failed",
      debug: debugLog,
    });
  }
};

module.exports.config = config;
