import os
import uuid
import json
import re
import secrets
import string
import httpx
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from twilio.rest import Client as TwilioClient
from openai import OpenAI

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client
def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)

# Utils
def create_phone_alias(phone: str | None) -> str:
    if not phone:
        return "Unknown"
    digits = re.sub(r'\D', '', phone)
    if len(digits) >= 4:
        return f"***-***-{digits[-4:]}"
    return "***-***-****"

def generate_tracking_token(length: int = 12) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

# ============ VAPI WEBHOOK ============
@app.post("/webhook/vapi")
async def vapi_webhook(request: Request):
    payload = await request.json()
    message = payload.get("message", {})
    event_type = message.get("type")

    if event_type == "end-of-call-report":
        return await handle_end_of_call(message)

    return {"status": "ok"}

async def handle_end_of_call(message: dict):
    supabase = get_supabase()

    call_data = message.get("call", {})
    vapi_call_id = call_data.get("id")
    customer = call_data.get("customer", {})
    caller_phone = customer.get("number")

    transcript = message.get("transcript")
    summary = message.get("summary")

    # Extract structured data
    collected_data = extract_collected_data(message)

    phone_alias = create_phone_alias(caller_phone)
    tracking_token = generate_tracking_token()

    # Calculate duration
    duration_seconds = None
    if call_data.get("startedAt") and call_data.get("endedAt"):
        try:
            started = datetime.fromisoformat(call_data["startedAt"].replace("Z", "+00:00"))
            ended = datetime.fromisoformat(call_data["endedAt"].replace("Z", "+00:00"))
            duration_seconds = int((ended - started).total_seconds())
        except:
            pass

    # Store service request
    service_request = {
        "id": str(uuid.uuid4()),
        "vapi_call_id": vapi_call_id,
        "caller_phone": caller_phone,
        "caller_phone_alias": phone_alias,
        "caller_name": collected_data.get("name"),
        "caller_address": collected_data.get("address"),
        "zip_code": collected_data.get("zip_code"),
        "service_type": collected_data.get("service_type"),
        "description": collected_data.get("description"),
        "timeline": collected_data.get("urgency") or collected_data.get("timeline"),
        "call_transcript": transcript,
        "call_summary": summary,
        "call_duration_seconds": duration_seconds,
        "tracking_token": tracking_token,
        "status": "pending",
        "business_discovery_status": "pending"
    }

    result = supabase.table("service_requests").insert(service_request).execute()
    request_id = result.data[0]["id"]

    # Send SMS immediately
    if caller_phone:
        await send_sms(request_id, caller_phone, tracking_token, collected_data.get("service_type", "home service"))

    # Run business discovery
    location = collected_data.get("zip_code") or collected_data.get("address")
    if location:
        await run_business_discovery(request_id, collected_data.get("service_type", "home services"), location)

    return {"status": "ok", "request_id": request_id}

def extract_collected_data(message: dict) -> dict:
    """Use Groq to extract structured data from the call transcript."""
    transcript = message.get("transcript", "")

    if not transcript:
        return {"description": message.get("summary", "")}

    try:
        groq = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1"
        )

        response = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """Extract customer info from this home service call transcript.
Return JSON only with these fields (use null if not mentioned):
{
  "name": "customer's first name",
  "service_type": "type of service needed (plumbing, electrical, hvac, roofing, etc)",
  "zip_code": "zip code or null",
  "address": "service address if given, or null",
  "description": "brief summary of what they need done",
  "urgency": "emergency, soon, flexible, or null"
}"""
                },
                {"role": "user", "content": transcript}
            ],
            temperature=0.1,
            max_tokens=500
        )

        result_text = response.choices[0].message.content.strip()

        # Clean up markdown code blocks if present
        if result_text.startswith("```"):
            lines = result_text.split("\n")
            result_text = "\n".join(lines[1:-1])
        if result_text.startswith("json"):
            result_text = result_text[4:].strip()

        return json.loads(result_text)

    except Exception as e:
        print(f"Groq extraction error: {e}")
        return {"description": message.get("summary", "")}

# ============ SMS SERVICE ============
async def send_sms(service_request_id: str, to_phone: str, tracking_token: str, service_type: str):
    supabase = get_supabase()

    message_body = (
        f"Hey! This is Quinn. I've started reaching out to local contractors for your {service_type} project. "
        f"I'll keep you updated here!"
    )

    try:
        client = TwilioClient(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN")
        )
        message = client.messages.create(
            body=message_body,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            to=to_phone
        )

        supabase.table("sms_messages").insert({
            "service_request_id": service_request_id,
            "to_phone": to_phone,
            "message_body": message_body,
            "twilio_sid": message.sid,
            "status": "sent"
        }).execute()

        supabase.table("service_requests").update({
            "sms_sent_at": datetime.utcnow().isoformat()
        }).eq("id", service_request_id).execute()

    except Exception as e:
        supabase.table("sms_messages").insert({
            "service_request_id": service_request_id,
            "to_phone": to_phone,
            "message_body": message_body,
            "status": "failed",
            "error_message": str(e)
        }).execute()

# ============ BUSINESS DISCOVERY ============
async def run_business_discovery(service_request_id: str, service_type: str, location: str):
    supabase = get_supabase()

    supabase.table("service_requests").update({
        "business_discovery_status": "in_progress",
        "business_discovery_started_at": datetime.utcnow().isoformat()
    }).eq("id", service_request_id).execute()

    try:
        # Build search query
        service_map = {
            "plumbing": "plumber", "plumber": "plumber",
            "electrical": "electrician", "electrician": "electrician",
            "hvac": "hvac contractor", "heating": "hvac contractor", "cooling": "hvac contractor",
            "roofing": "roofing contractor", "roof": "roofing contractor",
            "painting": "house painter", "painter": "house painter",
            "cleaning": "house cleaning service",
            "landscaping": "landscaping company", "lawn": "lawn care service",
            "handyman": "handyman services",
        }

        search_term = service_type.lower() if service_type else "home services"
        for key, value in service_map.items():
            if key in search_term:
                search_term = value
                break

        search_query = f"{search_term} near {location}"

        # Detect region: Canadian postal codes start with a letter (e.g., V8T 4G8)
        region = "us"
        if location and len(location) >= 1 and location[0].isalpha():
            region = "ca"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://local-business-data.p.rapidapi.com/search",
                headers={
                    "X-RapidAPI-Key": os.getenv("RAPIDAPI_KEY"),
                    "X-RapidAPI-Host": "local-business-data.p.rapidapi.com"
                },
                params={"query": search_query, "limit": 30, "language": "en", "region": region}
            )
            response.raise_for_status()
            data = response.json()

        businesses = []
        for item in data.get("data", []):
            businesses.append({
                "service_request_id": service_request_id,
                "google_place_id": item.get("place_id"),
                "business_name": item.get("name"),
                "phone": item.get("phone_number"),
                "website": item.get("website"),
                "full_address": item.get("full_address"),
                "latitude": item.get("latitude"),
                "longitude": item.get("longitude"),
                "rating": item.get("rating"),
                "review_count": item.get("review_count"),
                "business_category": item.get("type"),
                "contact_extraction_status": "pending"
            })

        if businesses:
            supabase.table("discovered_businesses").insert(businesses).execute()

        supabase.table("service_requests").update({
            "business_discovery_status": "completed",
            "business_discovery_completed_at": datetime.utcnow().isoformat()
        }).eq("id", service_request_id).execute()

        # Run contact extraction for businesses with websites
        await run_contact_extraction(service_request_id)

    except Exception as e:
        supabase.table("service_requests").update({
            "business_discovery_status": "failed"
        }).eq("id", service_request_id).execute()

# ============ CONTACT EXTRACTION ============
async def run_contact_extraction(service_request_id: str):
    supabase = get_supabase()
    groq = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1")

    result = supabase.table("discovered_businesses").select("*").eq(
        "service_request_id", service_request_id
    ).eq("contact_extraction_status", "pending").not_.is_("website", "null").execute()

    for business in result.data[:10]:  # Limit to first 10 to avoid timeout
        business_id = business["id"]
        website = business["website"]

        try:
            # Scrape with Jina Reader
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"https://r.jina.ai/{website}")
                if response.status_code != 200:
                    continue
                content = response.text[:8000]

            # Extract with Groq
            extraction = groq.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "Extract contact info, return JSON only: {phone, email, address}"},
                    {"role": "user", "content": f"Extract contacts from:\n{content}"}
                ],
                temperature=0.1,
                max_tokens=300
            )

            result_text = extraction.choices[0].message.content.strip()
            if result_text.startswith("```"):
                result_text = "\n".join(result_text.split("\n")[1:-1])

            contacts = json.loads(result_text)

            update_data = {
                "contact_extraction_status": "completed",
                "contact_extracted_at": datetime.utcnow().isoformat(),
                "parsed_contact_data": contacts
            }
            if contacts.get("phone") and not business.get("phone"):
                update_data["phone"] = contacts["phone"]
            if contacts.get("email"):
                update_data["email"] = contacts["email"]

            supabase.table("discovered_businesses").update(update_data).eq("id", business_id).execute()

        except Exception as e:
            supabase.table("discovered_businesses").update({
                "contact_extraction_status": "failed"
            }).eq("id", business_id).execute()

# ============ DASHBOARD API ============
@app.get("/api/service-requests")
async def list_service_requests():
    supabase = get_supabase()
    result = supabase.table("service_requests").select("*").order("created_at", desc=True).execute()
    return result.data

@app.get("/api/service-requests/{request_id}")
async def get_service_request(request_id: str):
    supabase = get_supabase()
    result = supabase.table("service_requests").select("*").eq("id", request_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Not found")
    return result.data

@app.get("/api/service-requests/{request_id}/businesses")
async def list_businesses(request_id: str):
    supabase = get_supabase()
    result = supabase.table("discovered_businesses").select("*").eq(
        "service_request_id", request_id
    ).order("rating", desc=True).execute()
    return result.data

@app.post("/api/service-requests/{request_id}/retry-discovery")
async def retry_discovery(request_id: str):
    supabase = get_supabase()
    result = supabase.table("service_requests").select("*").eq("id", request_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Not found")

    request_data = result.data
    location = request_data.get("zip_code") or request_data.get("caller_address")
    service_type = request_data.get("service_type", "home services")

    if not location:
        raise HTTPException(status_code=400, detail="No location data available")

    # Clear any existing businesses for this request
    supabase.table("discovered_businesses").delete().eq("service_request_id", request_id).execute()

    # Run discovery again
    await run_business_discovery(request_id, service_type, location)

    return {"status": "ok", "message": "Discovery restarted"}

@app.get("/api/track/{token}")
async def get_tracking_info(token: str):
    supabase = get_supabase()
    result = supabase.table("service_requests").select(
        "id, service_type, status, business_discovery_status, created_at"
    ).eq("tracking_token", token).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Not found")

    biz_result = supabase.table("discovered_businesses").select(
        "id", count="exact"
    ).eq("service_request_id", result.data["id"]).execute()

    return {
        "service_type": result.data["service_type"],
        "status": result.data["status"],
        "discovery_status": result.data["business_discovery_status"],
        "contractors_found": biz_result.count or 0,
        "created_at": result.data["created_at"]
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
