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
    let solvingFinished = false;
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("browserbase-solving")) {
        debugLog.push({ step: "captcha_event", message: text, time: Date.now() });
        if (text.includes("browserbase-solving-finished")) {
          solvingFinished = true;
        }
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

    // Wait for Browserbase to automatically solve the CAPTCHA
    // According to docs, it should handle it in the background
    debugLog.push({ step: "waiting_for_captcha_auto_solve", time: Date.now() });

    let waited = 0;
    const maxWait = 45000;
    while (!solvingFinished && waited < maxWait) {
      await new Promise(r => setTimeout(r, 3000));
      waited += 3000;

      // Check if checkbox is already checked
      const checkboxState = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[title*="reCAPTCHA"]');
        if (iframe && iframe.contentDocument) {
          const checkbox = iframe.contentDocument.querySelector('.recaptcha-checkbox-checked');
          return !!checkbox;
        }
        return false;
      }).catch(() => false);

      debugLog.push({ step: "polling", waited, solvingFinished, checkboxState, time: Date.now() });

      if (checkboxState) {
        debugLog.push({ step: "checkbox_already_checked", time: Date.now() });
        break;
      }
    }

    // If not auto-solved, try clicking manually
    if (!solvingFinished) {
      debugLog.push({ step: "trying_manual_click", time: Date.now() });
      const clickResult = await stagehand.act("Click the reCAPTCHA checkbox that says 'I'm not a robot'");
      debugLog.push({ step: "clicked_checkbox", result: clickResult, time: Date.now() });

      // Wait a bit more for solving after manual click
      await new Promise(r => setTimeout(r, 15000));
    }

    debugLog.push({ step: "done_waiting", solvingFinished, totalWaited: waited, time: Date.now() });

    // Take screenshot to see state
    const midScreenshot = await page.screenshot();
    const midBase64 = midScreenshot.toString('base64');
    debugLog.push({ step: "screenshot_mid", time: Date.now() });

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
    const pageContent = await page.evaluate(() => document.body.innerText);
    const success = pageContent.includes("Verification Success") ||
                    pageContent.includes("score") ||
                    page.url().includes("action=demo");

    await stagehand.close();

    res.status(200).json({
      success,
      message: success ? "CAPTCHA solved successfully!" : "CAPTCHA may not have been solved",
      pageContent: pageContent.substring(0, 500),
      debug: debugLog,
      screenshotMid: midBase64,
      screenshotAfter: afterBase64,
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
