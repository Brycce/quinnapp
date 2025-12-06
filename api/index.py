import os
import uuid
import json
import re
import secrets
import string
import httpx
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException, Response
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

    # Generate outreach email template
    email_template = generate_outreach_email(collected_data)
    service_request["outreach_email_template"] = email_template

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

def generate_outreach_email(collected_data: dict) -> str:
    """Generate a brief outreach email template using Groq."""
    try:
        groq = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1"
        )

        name = collected_data.get("name", "A customer")
        service_type = collected_data.get("service_type", "home service")
        description = collected_data.get("description", "")
        location = collected_data.get("address") or collected_data.get("zip_code", "")
        timeline = collected_data.get("urgency") or collected_data.get("timeline", "flexible")

        prompt = f"""Write a brief, professional email to a contractor asking if they're available for a job.

Customer: {name}
Service needed: {service_type}
Details: {description}
Location: {location}
Timeline: {timeline}

Keep it under 100 words. Be friendly but professional. Don't include subject line. Just the body."""

        response = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You write brief, professional outreach emails for home service requests."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=200
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"Email generation error: {e}")
        # Return a basic template as fallback
        name = collected_data.get("name", "A customer")
        service_type = collected_data.get("service_type", "home service")
        description = collected_data.get("description", "work done")
        return f"Hi,\n\nI have a customer looking for {service_type} help. They need {description}.\n\nAre you available to provide a quote?\n\nThanks!"

# ============ SMS SERVICE ============
@app.post("/webhook/twilio")
async def twilio_incoming_sms(request: Request):
    """Handle incoming SMS from Twilio."""
    form_data = await request.form()
    from_phone = form_data.get("From")
    to_phone = form_data.get("To")
    message_body = form_data.get("Body", "").strip()
    twilio_sid = form_data.get("MessageSid")

    supabase = get_supabase()

    # Find the most recent service request for this phone number
    result = supabase.table("service_requests").select("*").eq(
        "caller_phone", from_phone
    ).order("created_at", desc=True).limit(1).execute()

    if not result.data:
        # No service request found - send a helpful response
        response_text = "Hi! I don't have a record of your request. Please call our number to start a new service request."
    else:
        service_request = result.data[0]
        request_id = service_request["id"]

        # Store incoming message
        supabase.table("sms_messages").insert({
            "service_request_id": request_id,
            "from_phone": from_phone,
            "to_phone": to_phone,
            "message_body": message_body,
            "twilio_sid": twilio_sid,
            "direction": "inbound",
            "status": "received"
        }).execute()

        # Get conversation history
        history = supabase.table("sms_messages").select("*").eq(
            "service_request_id", request_id
        ).order("created_at").execute()

        # Generate context-aware response
        response_text = generate_sms_response(service_request, history.data, message_body)

        # Send response
        await send_sms_reply(request_id, from_phone, response_text)

    # Return TwiML response
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    return Response(content=twiml, media_type="application/xml")

def generate_sms_response(service_request: dict, history: list, user_message: str) -> str:
    """Generate a context-aware SMS response using Groq."""
    try:
        groq = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1"
        )

        # Build context from service request
        context = f"""Service Request Context:
- Customer: {service_request.get('caller_name', 'Unknown')}
- Service Type: {service_request.get('service_type', 'home service')}
- Description: {service_request.get('description', 'Not specified')}
- Location: {service_request.get('caller_address') or service_request.get('zip_code', 'Not specified')}
- Timeline: {service_request.get('timeline', 'Flexible')}
- Status: {service_request.get('status', 'pending')}
- Contractors Found: {service_request.get('business_discovery_status', 'pending')}"""

        # Build conversation history
        conv_history = ""
        for msg in history[-10:]:  # Last 10 messages
            direction = "Customer" if msg.get("direction") == "inbound" else "Quinn"
            conv_history += f"{direction}: {msg.get('message_body', '')}\n"

        prompt = f"""{context}

Recent Conversation:
{conv_history}

Customer's new message: {user_message}

Respond as Quinn, the friendly home services assistant. Keep responses brief (under 160 characters if possible for SMS).
If they're adding info, acknowledge it and confirm you've noted it.
If asking about status, give a brief update.
If unclear, ask a clarifying question."""

        response = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are Quinn, a friendly SMS assistant helping homeowners with service requests. Be concise and helpful."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=100
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"SMS response generation error: {e}")
        return "Thanks for your message! I've noted it. Reply anytime if you have questions."

async def send_sms_reply(service_request_id: str, to_phone: str, message_body: str):
    """Send an SMS reply."""
    supabase = get_supabase()

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
            "from_phone": os.getenv("TWILIO_PHONE_NUMBER"),
            "to_phone": to_phone,
            "message_body": message_body,
            "twilio_sid": message.sid,
            "direction": "outbound",
            "status": "sent"
        }).execute()

    except Exception as e:
        print(f"SMS reply error: {e}")
        supabase.table("sms_messages").insert({
            "service_request_id": service_request_id,
            "to_phone": to_phone,
            "message_body": message_body,
            "direction": "outbound",
            "status": "failed",
            "error_message": str(e)
        }).execute()

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
            "from_phone": os.getenv("TWILIO_PHONE_NUMBER"),
            "to_phone": to_phone,
            "message_body": message_body,
            "twilio_sid": message.sid,
            "direction": "outbound",
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
            "direction": "outbound",
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

    for business in result.data[:5]:  # Limit to 5 per batch to avoid Vercel timeout
        business_id = business["id"]
        website = business["website"]

        try:
            # Scrape with Jina Reader - try main page and contact page
            content = ""
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Try main page
                response = await client.get(f"https://r.jina.ai/{website}")
                if response.status_code == 200:
                    content = response.text[:6000]

                # Also try contact page for emails
                for contact_path in ["/contact", "/contact-us", "/about", "/about-us"]:
                    try:
                        contact_url = website.rstrip("/") + contact_path
                        contact_response = await client.get(f"https://r.jina.ai/{contact_url}")
                        if contact_response.status_code == 200:
                            content += "\n\n--- CONTACT PAGE ---\n" + contact_response.text[:4000]
                            break
                    except:
                        continue

            if not content:
                continue

            # Extract with Groq - improved prompt for email extraction
            extraction = groq.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": """Extract contact info from this website content. Look carefully for:
- Email addresses (check mailto: links, contact forms mentions, info@, contact@, etc.)
- Phone numbers
- Physical address

Return JSON only: {"phone": "...", "email": "...", "address": "..."}
Use null for any field not found. Be thorough in finding emails."""},
                    {"role": "user", "content": f"Extract all contact info from:\n{content}"}
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

@app.post("/api/service-requests/{request_id}/extract-contacts")
async def extract_contacts(request_id: str):
    """Process contact extraction for pending businesses (batch of 5)."""
    supabase = get_supabase()

    # Verify request exists
    result = supabase.table("service_requests").select("id").eq("id", request_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Not found")

    # Get pending businesses with websites
    pending = supabase.table("discovered_businesses").select("id, business_name").eq(
        "service_request_id", request_id
    ).eq("contact_extraction_status", "pending").not_.is_("website", "null").execute()

    if not pending.data:
        return {"status": "done", "message": "No pending businesses to process"}

    # Process this batch
    await run_contact_extraction(request_id)

    # Check remaining
    remaining = supabase.table("discovered_businesses").select("id", count="exact").eq(
        "service_request_id", request_id
    ).eq("contact_extraction_status", "pending").not_.is_("website", "null").execute()

    return {
        "status": "ok",
        "processed": min(5, len(pending.data)),
        "remaining": remaining.count or 0,
        "message": f"Processed batch. {remaining.count or 0} remaining."
    }

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
