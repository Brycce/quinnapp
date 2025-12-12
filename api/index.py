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

        # Check if there's a pending question waiting for an answer
        pending = supabase.table("pending_questions").select("*").eq(
            "service_request_id", request_id
        ).eq("status", "asked").order("asked_at", desc=True).limit(1).execute()

        if pending.data:
            # This SMS is likely an answer to our question
            pq = pending.data[0]

            # Store the answer in additional_context
            current_context = service_request.get("additional_context") or []
            current_context.append({
                "question": pq["question"],
                "answer": message_body,
                "source": "sms",
                "timestamp": datetime.utcnow().isoformat()
            })

            supabase.table("service_requests").update({
                "additional_context": current_context
            }).eq("id", request_id).execute()

            # Update pending question
            supabase.table("pending_questions").update({
                "status": "answered",
                "answer": message_body,
                "answered_at": datetime.utcnow().isoformat()
            }).eq("id", pq["id"]).execute()

            # Trigger reply to contractor via Node.js endpoint
            await trigger_contractor_reply(pq["id"], pq["question"], message_body)

            # Confirm to homeowner
            response_text = "Got it, thanks! I'll let the contractor know."
            await send_sms_reply(request_id, from_phone, response_text)

        # Check if we have presented quotes waiting for selection
        elif service_request.get("quotes_presented_at") and not service_request.get("selected_quote_id"):
            # Homeowner might be selecting a contractor
            await handle_quote_selection(service_request, message_body, from_phone)

        else:
            # No pending question - regular conversation flow
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


@app.post("/api/send-quotes-sms")
async def send_quotes_sms(request: Request):
    """
    Send quotes summary SMS to homeowner.
    Called from inbound-email.js when quotes are ready to present.
    """
    payload = await request.json()
    service_request_id = payload.get("service_request_id")
    to_phone = payload.get("to_phone")
    message = payload.get("message")
    quote_ids = payload.get("quote_ids", [])

    if not all([service_request_id, to_phone, message]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    supabase = get_supabase()

    # Send the SMS
    await send_sms_reply(service_request_id, to_phone, message)

    # Mark quotes as presented
    if quote_ids:
        supabase.table("quotes").update({
            "status": "presented",
            "presented_at": datetime.utcnow().isoformat()
        }).in_("id", quote_ids).execute()

    return {"status": "ok", "message": "Quotes SMS sent to homeowner"}


@app.post("/api/trigger-question-sms")
async def trigger_question_sms(request: Request):
    """
    Trigger SMS to homeowner asking a contractor's question.
    Called from inbound-email.js when a contractor asks for more info.
    """
    payload = await request.json()
    service_request_id = payload.get("service_request_id")
    pending_question_id = payload.get("pending_question_id")
    question = payload.get("question")
    to_phone = payload.get("to_phone")
    customer_name = payload.get("customer_name", "")

    if not all([service_request_id, question, to_phone]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    supabase = get_supabase()

    # Format a friendly message
    first_name = customer_name.split()[0] if customer_name else "there"
    message = f"Hey {first_name}! One of the contractors asked: \"{question}\" - can you let me know?"

    # Send the SMS
    await send_sms_reply(service_request_id, to_phone, message)

    # Update pending question status if ID provided
    if pending_question_id:
        supabase.table("pending_questions").update({
            "status": "asked",
            "asked_at": datetime.utcnow().isoformat()
        }).eq("id", pending_question_id).execute()

    return {"status": "ok", "message": "SMS sent to homeowner"}


async def handle_quote_selection(service_request: dict, message_body: str, from_phone: str):
    """
    Use LLM to interpret which contractor the homeowner selected from the presented quotes.
    """
    supabase = get_supabase()
    request_id = service_request["id"]

    # Get presented quotes with business names
    quotes_result = supabase.table("quotes").select(
        "*, discovered_businesses(id, business_name, phone, email)"
    ).eq("service_request_id", request_id).eq("status", "presented").execute()

    if not quotes_result.data:
        # No quotes to select from - fall back to regular conversation
        response_text = "I'm not sure which contractor you're referring to. Could you clarify?"
        await send_sms_reply(request_id, from_phone, response_text)
        return

    quotes = quotes_result.data

    # Build contractor list for LLM
    contractor_list = []
    for q in quotes:
        biz = q.get("discovered_businesses") or {}
        contractor_list.append({
            "quote_id": q["id"],
            "business_name": biz.get("business_name", "Unknown"),
            "price": q.get("price_estimate", "price not specified"),
            "availability": q.get("availability", "availability not specified")
        })

    # Use LLM to determine which contractor was selected
    try:
        groq = OpenAI(
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1"
        )

        contractor_desc = "\n".join([
            f"- {c['business_name']}: {c['price']}, {c['availability']}"
            for c in contractor_list
        ])

        response = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """You help identify which contractor a homeowner selected based on their message.
Return JSON only: {"selected_index": number or null, "confidence": "high" | "medium" | "low", "reason": "brief explanation"}
- selected_index is 0-based index into the contractor list, or null if unclear
- Use high confidence for direct mentions of business name
- Use medium confidence for clear indirect references (e.g., "the cheap one", "first one")
- Use low confidence if very ambiguous"""
                },
                {
                    "role": "user",
                    "content": f"""Contractors presented to homeowner:
{contractor_desc}

Homeowner's response: "{message_body}"

Which contractor did they select?"""
                }
            ],
            temperature=0.1,
            max_tokens=200
        )

        result_text = response.choices[0].message.content.strip()
        if result_text.startswith("```"):
            result_text = "\n".join(result_text.split("\n")[1:-1])

        selection = json.loads(result_text)
        selected_index = selection.get("selected_index")
        confidence = selection.get("confidence", "low")

        if selected_index is not None and 0 <= selected_index < len(contractor_list):
            selected = contractor_list[selected_index]
            selected_quote = next((q for q in quotes if q["id"] == selected["quote_id"]), None)

            if selected_quote and confidence in ["high", "medium"]:
                # Mark quote as selected
                await finalize_quote_selection(service_request, selected_quote, from_phone)
                return

        # Couldn't determine selection - ask for clarification
        response_text = "I wasn't quite sure which contractor you meant. Could you tell me the name of the one you'd like to go with?"
        await send_sms_reply(request_id, from_phone, response_text)

    except Exception as e:
        print(f"Error in quote selection LLM: {e}")
        response_text = "Sorry, I had trouble understanding. Which contractor would you like to go with? Just reply with their name."
        await send_sms_reply(request_id, from_phone, response_text)


async def finalize_quote_selection(service_request: dict, selected_quote: dict, from_phone: str):
    """
    Finalize the quote selection - update DB, notify homeowner, and email contractor.
    """
    supabase = get_supabase()
    request_id = service_request["id"]

    business = selected_quote.get("discovered_businesses") or {}
    business_name = business.get("business_name", "the contractor")
    business_email = business.get("email")
    business_phone = business.get("phone")

    # Update quote status to selected
    supabase.table("quotes").update({
        "status": "selected",
        "selected_at": datetime.utcnow().isoformat()
    }).eq("id", selected_quote["id"]).execute()

    # Update other quotes to rejected
    supabase.table("quotes").update({
        "status": "rejected"
    }).eq("service_request_id", request_id).eq("status", "presented").execute()

    # Update service request with selected quote
    supabase.table("service_requests").update({
        "selected_quote_id": selected_quote["id"],
        "status": "contractor_selected"
    }).eq("id", request_id).execute()

    # Confirm to homeowner
    response_text = f"Great choice! I'll let {business_name} know you've selected them. They'll reach out to schedule."
    await send_sms_reply(request_id, from_phone, response_text)

    # Notify contractor via email
    if business_email:
        await notify_selected_contractor(service_request, selected_quote, business)
    else:
        print(f"No email for selected contractor {business_name} - manual follow-up needed")


async def notify_selected_contractor(service_request: dict, quote: dict, business: dict):
    """
    Send email to selected contractor with homeowner's details.
    """
    api_base = os.getenv("VERCEL_URL", "https://quinn-oimo.vercel.app")
    if not api_base.startswith("http"):
        api_base = f"https://{api_base}"

    customer_name = service_request.get("caller_name", "Customer")
    customer_phone = service_request.get("caller_phone", "")
    customer_address = service_request.get("caller_address") or service_request.get("zip_code", "")
    service_type = service_request.get("service_type", "service")
    description = service_request.get("description", "")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            await client.post(
                f"{api_base}/api/notify-contractor-selected",
                json={
                    "contractor_email": business.get("email"),
                    "contractor_name": business.get("business_name"),
                    "tracking_token": service_request.get("tracking_token"),
                    "customer_name": customer_name,
                    "customer_phone": customer_phone,
                    "customer_address": customer_address,
                    "service_type": service_type,
                    "description": description,
                    "quote_details": {
                        "price": quote.get("price_estimate"),
                        "availability": quote.get("availability"),
                    }
                }
            )
        print(f"Notified contractor {business.get('business_name')} of selection")
    except Exception as e:
        print(f"Error notifying contractor: {e}")


async def trigger_contractor_reply(pending_question_id: str, question: str, answer: str):
    """
    Call the Node.js endpoint to send a reply email to the contractor.
    """
    supabase = get_supabase()

    # Get the pending question with related email info
    pq_result = supabase.table("pending_questions").select(
        "*, inbound_emails(*), service_requests(*)"
    ).eq("id", pending_question_id).single().execute()

    if not pq_result.data:
        print(f"Could not find pending question: {pending_question_id}")
        return

    pq = pq_result.data
    email = pq.get("inbound_emails")
    service_request = pq.get("service_requests")

    if not email:
        print(f"No inbound email found for pending question: {pending_question_id}")
        return

    # Call the Node.js reply endpoint
    api_base = os.getenv("VERCEL_URL", "https://quinn-oimo.vercel.app")
    if not api_base.startswith("http"):
        api_base = f"https://{api_base}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{api_base}/api/reply-to-contractor",
                json={
                    "pending_question_id": pending_question_id,
                    "original_email": {
                        "id": email.get("id"),
                        "sender": email.get("sender"),
                        "recipient": email.get("recipient"),
                        "subject": email.get("subject"),
                    },
                    "question": question,
                    "answer": answer,
                    "service_request": {
                        "service_type": service_request.get("service_type"),
                        "caller_name": service_request.get("caller_name"),
                    }
                }
            )

            if response.status_code == 200:
                # Update pending question to replied
                supabase.table("pending_questions").update({
                    "status": "replied"
                }).eq("id", pending_question_id).execute()
                print(f"Successfully replied to contractor for question: {pending_question_id}")
            else:
                print(f"Failed to reply to contractor: {response.text}")

    except Exception as e:
        print(f"Error triggering contractor reply: {e}")

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

@app.post("/api/service-requests/{request_id}/submit-forms")
async def submit_forms(request_id: str):
    """Trigger form submission for businesses without emails (batch of 3)."""
    supabase = get_supabase()

    # Get service request details
    req_result = supabase.table("service_requests").select("*").eq("id", request_id).single().execute()
    if not req_result.data:
        raise HTTPException(status_code=404, detail="Not found")

    service_request = req_result.data

    # Get businesses without emails that have websites and haven't had form submission attempted
    pending = supabase.table("discovered_businesses").select("*").eq(
        "service_request_id", request_id
    ).is_("email", "null").not_.is_("website", "null").eq(
        "form_submission_status", "pending"
    ).limit(3).execute()

    if not pending.data:
        return {"status": "done", "message": "No pending businesses for form submission"}

    results = []
    api_base = os.getenv("VERCEL_URL", "https://quinn-oimo.vercel.app")
    if not api_base.startswith("http"):
        api_base = f"https://{api_base}"

    for business in pending.data:
        try:
            # Mark as in progress
            supabase.table("discovered_businesses").update({
                "form_submission_status": "in_progress",
                "form_submission_attempted_at": datetime.utcnow().isoformat()
            }).eq("id", business["id"]).execute()

            # Call the form filling endpoint
            async with httpx.AsyncClient(timeout=130.0) as client:
                response = await client.post(
                    f"{api_base}/api/fill-form",
                    json={
                        "businessId": business["id"],
                        "businessName": business["business_name"],
                        "website": business["website"],
                        "trackingToken": service_request.get("tracking_token"),
                        "additionalContext": service_request.get("additional_context") or [],
                        "serviceRequest": {
                            "customerName": service_request.get("caller_name", "Customer"),
                            "serviceType": service_request.get("service_type", "home service"),
                            "description": service_request.get("description", ""),
                            "location": service_request.get("caller_address") or service_request.get("zip_code", ""),
                            "timeline": service_request.get("timeline", "Flexible"),
                        }
                    }
                )
                result = response.json()

            # Update status based on result
            supabase.table("discovered_businesses").update({
                "form_submission_status": "completed" if result.get("success") else "failed",
                "form_submission_result": result,
                "contact_form_url": result.get("formUrl")
            }).eq("id", business["id"]).execute()

            results.append({
                "business": business["business_name"],
                "success": result.get("success", False),
                "message": result.get("message", "")
            })

        except Exception as e:
            supabase.table("discovered_businesses").update({
                "form_submission_status": "failed",
                "form_submission_result": {"error": str(e)}
            }).eq("id", business["id"]).execute()

            results.append({
                "business": business["business_name"],
                "success": False,
                "message": str(e)
            })

    # Check remaining
    remaining = supabase.table("discovered_businesses").select("id", count="exact").eq(
        "service_request_id", request_id
    ).is_("email", "null").not_.is_("website", "null").eq(
        "form_submission_status", "pending"
    ).execute()

    return {
        "status": "ok",
        "processed": len(results),
        "remaining": remaining.count or 0,
        "results": results
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
