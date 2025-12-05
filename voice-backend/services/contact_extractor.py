import os
import json
import httpx
from openai import OpenAI
from services.supabase_client import get_supabase

class ContactExtractorService:
    def __init__(self):
        self.jina_base_url = "https://r.jina.ai"
        self.groq_client = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1"
        )

    async def extract_contacts_from_website(self, website_url: str) -> dict:
        """Scrape website and extract contact information."""
        # Step 1: Get clean content from Jina Reader
        raw_content = await self._scrape_with_jina(website_url)

        if not raw_content:
            return {"error": "Failed to scrape website"}

        # Step 2: Use Groq to extract structured contact data
        contacts = await self._extract_with_groq(raw_content, website_url)

        return contacts

    async def _scrape_with_jina(self, url: str) -> str | None:
        """Use Jina Reader to get clean content from URL."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(f"{self.jina_base_url}/{url}")
                if response.status_code == 200:
                    return response.text
            except Exception as e:
                print(f"Jina scrape error for {url}: {e}")
        return None

    async def _extract_with_groq(self, content: str, source_url: str) -> dict:
        """Use Groq to extract structured contact info."""
        # Truncate content if too long
        max_chars = 8000
        if len(content) > max_chars:
            content = content[:max_chars]

        prompt = f"""Extract business contact information from this website content.

Return a JSON object with these fields (use null if not found):
- phone: string (primary phone number)
- email: string (primary email address)
- address: string (full physical address if different from what we have)

Website content:
{content}

Respond ONLY with the JSON object, no other text."""

        try:
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a data extraction assistant. Extract contact information and return valid JSON only."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=500
            )

            result_text = response.choices[0].message.content.strip()

            # Clean up potential markdown code blocks
            if result_text.startswith("```"):
                lines = result_text.split("\n")
                result_text = "\n".join(lines[1:-1])
            if result_text.startswith("json"):
                result_text = result_text[4:].strip()

            return json.loads(result_text)

        except Exception as e:
            print(f"Groq extraction error: {e}")
            return {"error": str(e)}

    async def process_businesses_for_request(self, service_request_id: str):
        """Extract contacts for all businesses in a service request."""
        supabase = get_supabase()

        # Get businesses with websites that haven't been processed
        result = supabase.table("discovered_businesses") \
            .select("*") \
            .eq("service_request_id", service_request_id) \
            .eq("contact_extraction_status", "pending") \
            .not_.is_("website", "null") \
            .execute()

        businesses = result.data

        for business in businesses:
            business_id = business["id"]
            website = business["website"]

            # Update status to in_progress
            supabase.table("discovered_businesses") \
                .update({"contact_extraction_status": "in_progress"}) \
                .eq("id", business_id) \
                .execute()

            try:
                # Extract contacts
                contacts = await self.extract_contacts_from_website(website)

                # Prepare update
                update_data = {
                    "contact_extraction_status": "completed",
                    "contact_extracted_at": "now()",
                    "raw_scraped_data": {"source_url": website},
                    "parsed_contact_data": contacts
                }

                # Update fields if extraction found better data
                if contacts.get("phone") and not business.get("phone"):
                    update_data["phone"] = contacts["phone"]
                if contacts.get("email"):
                    update_data["email"] = contacts["email"]

                supabase.table("discovered_businesses") \
                    .update(update_data) \
                    .eq("id", business_id) \
                    .execute()

            except Exception as e:
                supabase.table("discovered_businesses") \
                    .update({
                        "contact_extraction_status": "failed",
                        "parsed_contact_data": {"error": str(e)}
                    }) \
                    .eq("id", business_id) \
                    .execute()


# Singleton instance
_extractor_service: ContactExtractorService | None = None

def get_extractor_service() -> ContactExtractorService:
    global _extractor_service
    if _extractor_service is None:
        _extractor_service = ContactExtractorService()
    return _extractor_service
