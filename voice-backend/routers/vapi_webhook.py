import os
import uuid
from fastapi import APIRouter, Request, HTTPException
from services.supabase_client import get_supabase
from utils.phone_alias import create_phone_alias
from utils.token_generator import generate_tracking_token

router = APIRouter(prefix="/webhook", tags=["vapi"])

@router.post("/vapi")
async def vapi_webhook(request: Request):
    """Handle all Vapi webhook events."""
    payload = await request.json()
    message = payload.get("message", {})
    event_type = message.get("type")

    if event_type == "end-of-call-report":
        return await handle_end_of_call(message)
    elif event_type == "status-update":
        # Log status updates if needed
        return {"status": "ok"}

    return {"status": "ok"}


async def handle_end_of_call(message: dict):
    """Process end-of-call report from Vapi."""
    supabase = get_supabase()

    call_data = message.get("call", {})
    vapi_call_id = call_data.get("id")
    customer = call_data.get("customer", {})
    caller_phone = customer.get("number")

    # Get transcript and summary
    transcript = message.get("transcript")
    summary = message.get("summary")
    duration = call_data.get("endedAt") and call_data.get("startedAt")

    # Extract structured data from analysis or tool calls
    collected_data = extract_collected_data(message)

    # Create aliased contact info
    phone_alias = create_phone_alias(caller_phone)
    tracking_token = generate_tracking_token()

    # Calculate duration in seconds if we have timestamps
    duration_seconds = None
    if call_data.get("startedAt") and call_data.get("endedAt"):
        from datetime import datetime
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

    # Queue background jobs
    await queue_job("sms_confirmation", request_id, {
        "phone": caller_phone,
        "tracking_token": tracking_token,
        "service_type": collected_data.get("service_type", "home service")
    })

    await queue_job("business_discovery", request_id, {
        "service_type": collected_data.get("service_type"),
        "zip_code": collected_data.get("zip_code"),
        "address": collected_data.get("address")
    })

    return {"status": "ok", "request_id": request_id}


def extract_collected_data(message: dict) -> dict:
    """Extract structured data collected during the Vapi call.

    Vapi can return data via:
    - analysis.structuredData (if using extraction)
    - toolCalls results
    - Custom parsing from transcript
    """
    data = {}

    # Try to get from analysis
    analysis = message.get("analysis", {})
    if analysis.get("structuredData"):
        structured = analysis["structuredData"]
        data.update({
            "name": structured.get("customerName") or structured.get("name"),
            "address": structured.get("address") or structured.get("serviceAddress"),
            "zip_code": structured.get("zipCode") or structured.get("zip"),
            "service_type": structured.get("serviceType") or structured.get("service"),
            "description": structured.get("description") or structured.get("problem"),
            "urgency": structured.get("urgency") or structured.get("timeline"),
        })

    # Try to get from tool calls
    tool_calls = message.get("toolCalls", [])
    for tool_call in tool_calls:
        if tool_call.get("name") == "collectServiceDetails":
            args = tool_call.get("arguments", {})
            data.update({
                "name": args.get("name") or data.get("name"),
                "address": args.get("address") or data.get("address"),
                "zip_code": args.get("zip_code") or data.get("zip_code"),
                "service_type": args.get("service_type") or data.get("service_type"),
                "description": args.get("description") or data.get("description"),
                "urgency": args.get("urgency") or data.get("urgency"),
            })

    return data


async def queue_job(job_type: str, service_request_id: str, payload: dict):
    """Queue a background job for processing."""
    supabase = get_supabase()

    job = {
        "id": str(uuid.uuid4()),
        "job_type": job_type,
        "service_request_id": service_request_id,
        "status": "pending",
        "payload": payload
    }

    supabase.table("background_jobs").insert(job).execute()
