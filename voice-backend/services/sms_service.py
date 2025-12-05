import os
from twilio.rest import Client
from services.supabase_client import get_supabase

class SMSService:
    def __init__(self):
        self.client = Client(
            os.getenv("TWILIO_ACCOUNT_SID"),
            os.getenv("TWILIO_AUTH_TOKEN")
        )
        self.from_number = os.getenv("TWILIO_PHONE_NUMBER")
        self.base_url = os.getenv("APP_BASE_URL", "http://localhost:5173")

    async def send_tracking_sms(
        self,
        service_request_id: str,
        to_phone: str,
        tracking_token: str,
        service_type: str
    ) -> dict:
        """Send SMS with tracking link to homeowner."""
        supabase = get_supabase()
        tracking_url = f"{self.base_url}/track/{tracking_token}"

        message_body = (
            f"Thanks for calling about your {service_type} request! "
            f"We're finding contractors for you now. "
            f"Track your request: {tracking_url}"
        )

        # Record the SMS attempt
        sms_record = {
            "service_request_id": service_request_id,
            "to_phone": to_phone,
            "message_body": message_body,
            "status": "pending"
        }

        try:
            message = self.client.messages.create(
                body=message_body,
                from_=self.from_number,
                to=to_phone
            )

            sms_record["twilio_sid"] = message.sid
            sms_record["status"] = "sent"

            # Update service request
            supabase.table("service_requests") \
                .update({"sms_sent_at": "now()"}) \
                .eq("id", service_request_id) \
                .execute()

            result = {"success": True, "sid": message.sid}

        except Exception as e:
            sms_record["status"] = "failed"
            sms_record["error_message"] = str(e)
            result = {"success": False, "error": str(e)}

        # Save SMS record
        supabase.table("sms_messages").insert(sms_record).execute()

        return result


# Singleton instance
_sms_service: SMSService | None = None

def get_sms_service() -> SMSService:
    global _sms_service
    if _sms_service is None:
        _sms_service = SMSService()
    return _sms_service
