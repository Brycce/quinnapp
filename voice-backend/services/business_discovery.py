import os
import httpx
from typing import List
from services.supabase_client import get_supabase

class BusinessDiscoveryService:
    def __init__(self):
        self.api_key = os.getenv("RAPIDAPI_KEY")
        self.base_url = "https://local-business-data.p.rapidapi.com"
        self.headers = {
            "X-RapidAPI-Key": self.api_key,
            "X-RapidAPI-Host": "local-business-data.p.rapidapi.com"
        }

    async def search_businesses(
        self,
        service_request_id: str,
        service_type: str,
        location: str,
        limit: int = 30
    ) -> List[dict]:
        """Search for local businesses matching service type."""
        supabase = get_supabase()

        # Update status to in_progress
        supabase.table("service_requests") \
            .update({
                "business_discovery_status": "in_progress",
                "business_discovery_started_at": "now()"
            }) \
            .eq("id", service_request_id) \
            .execute()

        try:
            # Build search query
            search_query = self._build_search_query(service_type, location)

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.base_url}/search",
                    headers=self.headers,
                    params={
                        "query": search_query,
                        "limit": limit,
                        "language": "en",
                        "region": "us"
                    }
                )
                response.raise_for_status()
                data = response.json()

            # Parse and store businesses
            businesses = []
            for item in data.get("data", []):
                business = {
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
                }
                businesses.append(business)

            # Insert all businesses
            if businesses:
                supabase.table("discovered_businesses") \
                    .insert(businesses) \
                    .execute()

            # Update status to completed
            supabase.table("service_requests") \
                .update({
                    "business_discovery_status": "completed",
                    "business_discovery_completed_at": "now()"
                }) \
                .eq("id", service_request_id) \
                .execute()

            return businesses

        except Exception as e:
            # Update status to failed
            supabase.table("service_requests") \
                .update({"business_discovery_status": "failed"}) \
                .eq("id", service_request_id) \
                .execute()
            raise e

    def _build_search_query(self, service_type: str, location: str) -> str:
        """Build search query for RapidAPI."""
        # Map common service types to search terms
        service_map = {
            "plumbing": "plumber",
            "plumber": "plumber",
            "electrical": "electrician",
            "electrician": "electrician",
            "hvac": "hvac contractor",
            "heating": "hvac contractor",
            "cooling": "hvac contractor",
            "roofing": "roofing contractor",
            "roof": "roofing contractor",
            "painting": "house painter",
            "painter": "house painter",
            "cleaning": "house cleaning service",
            "cleaner": "house cleaning service",
            "landscaping": "landscaping company",
            "lawn": "lawn care service",
            "handyman": "handyman services",
            "general": "handyman services",
            "carpentry": "carpenter",
            "flooring": "flooring contractor",
            "pest": "pest control",
            "garage": "garage door repair"
        }

        # Find matching term or use as-is
        search_term = service_type.lower() if service_type else "home services"
        for key, value in service_map.items():
            if key in search_term:
                search_term = value
                break

        return f"{search_term} near {location}"


# Singleton instance
_discovery_service: BusinessDiscoveryService | None = None

def get_discovery_service() -> BusinessDiscoveryService:
    global _discovery_service
    if _discovery_service is None:
        _discovery_service = BusinessDiscoveryService()
    return _discovery_service
