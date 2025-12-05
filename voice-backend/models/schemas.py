from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any

# Service Request schemas
class ServiceRequestBase(BaseModel):
    service_type: Optional[str] = None
    description: Optional[str] = None
    timeline: Optional[str] = None
    zip_code: Optional[str] = None

class ServiceRequestCreate(ServiceRequestBase):
    caller_phone: Optional[str] = None
    caller_name: Optional[str] = None
    caller_address: Optional[str] = None
    vapi_call_id: Optional[str] = None
    call_transcript: Optional[Any] = None
    call_summary: Optional[str] = None
    call_duration_seconds: Optional[int] = None

class ServiceRequestResponse(ServiceRequestBase):
    id: str
    caller_phone_alias: Optional[str] = None
    caller_name: Optional[str] = None
    caller_address: Optional[str] = None
    status: str
    tracking_token: Optional[str] = None
    business_discovery_status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Discovered Business schemas
class DiscoveredBusinessBase(BaseModel):
    business_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    full_address: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None

class DiscoveredBusinessResponse(DiscoveredBusinessBase):
    id: str
    service_request_id: str
    contact_extraction_status: str
    outreach_status: str
    created_at: datetime

    class Config:
        from_attributes = True

# Vapi webhook schemas
class VapiMessage(BaseModel):
    type: str
    call: Optional[dict] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None

class VapiWebhookPayload(BaseModel):
    message: VapiMessage
