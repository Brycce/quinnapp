from fastapi import APIRouter, HTTPException
from typing import List
from services.supabase_client import get_supabase
from models.schemas import ServiceRequestResponse

router = APIRouter(prefix="/api/service-requests", tags=["service-requests"])


@router.get("", response_model=List[ServiceRequestResponse])
async def list_service_requests():
    """List all service requests, ordered by creation date (newest first)."""
    supabase = get_supabase()

    result = supabase.table("service_requests") \
        .select("*") \
        .order("created_at", desc=True) \
        .execute()

    return result.data


@router.get("/{request_id}", response_model=ServiceRequestResponse)
async def get_service_request(request_id: str):
    """Get a single service request by ID."""
    supabase = get_supabase()

    result = supabase.table("service_requests") \
        .select("*") \
        .eq("id", request_id) \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Service request not found")

    return result.data


@router.patch("/{request_id}")
async def update_service_request(request_id: str, updates: dict):
    """Update a service request."""
    supabase = get_supabase()

    # Only allow certain fields to be updated
    allowed_fields = {"status", "notes"}
    filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

    if not filtered_updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = supabase.table("service_requests") \
        .update(filtered_updates) \
        .eq("id", request_id) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Service request not found")

    return result.data[0]
