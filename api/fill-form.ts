import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  maxDuration: 120,
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
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

  if (!body?.website || !body?.serviceRequest) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    // Test imports one by one
    const stagehandModule = await import("@browserbasehq/stagehand");
    const groqModule = await import("@ai-sdk/groq");

    res.status(200).json({
      success: true,
      message: "Imports loaded successfully",
      stagehandExports: Object.keys(stagehandModule),
      groqExports: Object.keys(groqModule),
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack,
    });
  }
}
