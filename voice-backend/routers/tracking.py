from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase

router = APIRouter(prefix="/api/track", tags=["tracking"])


@router.get("/{token}")
async def get_tracking_info(token: str):
    """Public endpoint for homeowners to track their request status."""
    supabase = get_supabase()

    result = supabase.table("service_requests") \
        .select("id, service_type, status, business_discovery_status, created_at") \
        .eq("tracking_token", token) \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Request not found")

    request_data = result.data

    # Get count of discovered businesses
    biz_result = supabase.table("discovered_businesses") \
        .select("id", count="exact") \
        .eq("service_request_id", request_data["id"]) \
        .execute()

    business_count = biz_result.count or 0

    return {
        "service_type": request_data["service_type"],
        "status": request_data["status"],
        "discovery_status": request_data["business_discovery_status"],
        "contractors_found": business_count,
        "created_at": request_data["created_at"]
    }
