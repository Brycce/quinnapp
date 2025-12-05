import asyncio
from datetime import datetime
from services.supabase_client import get_supabase
from services.sms_service import get_sms_service
from services.business_discovery import get_discovery_service
from services.contact_extractor import get_extractor_service

async def process_pending_jobs():
    """Poll for pending jobs and process them."""
    supabase = get_supabase()

    while True:
        try:
            # Get next pending job
            result = supabase.table("background_jobs") \
                .select("*") \
                .eq("status", "pending") \
                .lte("scheduled_for", datetime.utcnow().isoformat()) \
                .order("created_at") \
                .limit(1) \
                .execute()

            if result.data:
                job = result.data[0]
                await process_job(job)

        except Exception as e:
            print(f"Job processor error: {e}")

        # Poll every 5 seconds
        await asyncio.sleep(5)


async def process_job(job: dict):
    """Process a single job."""
    supabase = get_supabase()
    job_id = job["id"]
    job_type = job["job_type"]
    payload = job.get("payload", {})
    service_request_id = job["service_request_id"]

    # Mark as processing
    supabase.table("background_jobs") \
        .update({
            "status": "processing",
            "started_at": datetime.utcnow().isoformat(),
            "attempts": job.get("attempts", 0) + 1
        }) \
        .eq("id", job_id) \
        .execute()

    try:
        if job_type == "sms_confirmation":
            await run_sms_confirmation(service_request_id, payload)
        elif job_type == "business_discovery":
            await run_business_discovery(service_request_id, payload)
        elif job_type == "contact_extraction":
            await run_contact_extraction(service_request_id, payload)
        else:
            raise ValueError(f"Unknown job type: {job_type}")

        # Mark as completed
        supabase.table("background_jobs") \
            .update({
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat()
            }) \
            .eq("id", job_id) \
            .execute()

    except Exception as e:
        error_msg = str(e)
        attempts = job.get("attempts", 0) + 1
        max_attempts = job.get("max_attempts", 3)

        if attempts >= max_attempts:
            status = "failed"
        else:
            status = "pending"  # Will retry

        supabase.table("background_jobs") \
            .update({
                "status": status,
                "error_message": error_msg,
                "result": {"error": error_msg}
            }) \
            .eq("id", job_id) \
            .execute()


async def run_sms_confirmation(service_request_id: str, payload: dict):
    """Send SMS confirmation to homeowner."""
    sms_service = get_sms_service()

    phone = payload.get("phone")
    tracking_token = payload.get("tracking_token")
    service_type = payload.get("service_type", "home service")

    if not phone or not tracking_token:
        raise ValueError("Missing phone or tracking_token in payload")

    await sms_service.send_tracking_sms(
        service_request_id=service_request_id,
        to_phone=phone,
        tracking_token=tracking_token,
        service_type=service_type
    )


async def run_business_discovery(service_request_id: str, payload: dict):
    """Run business discovery and then queue contact extraction."""
    discovery_service = get_discovery_service()
    supabase = get_supabase()

    service_type = payload.get("service_type", "home services")
    location = payload.get("zip_code") or payload.get("address")

    if not location:
        raise ValueError("Missing location (zip_code or address) in payload")

    # Run discovery
    businesses = await discovery_service.search_businesses(
        service_request_id=service_request_id,
        service_type=service_type,
        location=location,
        limit=30
    )

    # Queue contact extraction job
    if businesses:
        import uuid
        supabase.table("background_jobs").insert({
            "id": str(uuid.uuid4()),
            "job_type": "contact_extraction",
            "service_request_id": service_request_id,
            "status": "pending",
            "payload": {}
        }).execute()


async def run_contact_extraction(service_request_id: str, payload: dict):
    """Extract contacts from business websites."""
    extractor_service = get_extractor_service()

    await extractor_service.process_businesses_for_request(service_request_id)
