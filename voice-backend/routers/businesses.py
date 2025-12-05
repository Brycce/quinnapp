from fastapi import APIRouter, HTTPException
from typing import List
from services.supabase_client import get_supabase
from models.schemas import DiscoveredBusinessResponse

router = APIRouter(prefix="/api/service-requests", tags=["businesses"])


@router.get("/{request_id}/businesses", response_model=List[DiscoveredBusinessResponse])
async def list_businesses(request_id: str):
    """List all discovered businesses for a service request."""
    supabase = get_supabase()

    # Verify service request exists
    req_result = supabase.table("service_requests") \
        .select("id") \
        .eq("id", request_id) \
        .single() \
        .execute()

    if not req_result.data:
        raise HTTPException(status_code=404, detail="Service request not found")

    # Get businesses
    result = supabase.table("discovered_businesses") \
        .select("*") \
        .eq("service_request_id", request_id) \
        .order("rating", desc=True) \
        .execute()

    return result.data


@router.patch("/{request_id}/businesses/{business_id}")
async def update_business(request_id: str, business_id: str, updates: dict):
    """Update a business record (e.g., add outreach notes)."""
    supabase = get_supabase()

    # Only allow certain fields to be updated
    allowed_fields = {"outreach_status", "outreach_notes"}
    filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

    if not filtered_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = supabase.table("discovered_businesses") \
        .update(filtered_updates) \
        .eq("id", business_id) \
        .eq("service_request_id", request_id) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Business not found")

    return result.data[0]
