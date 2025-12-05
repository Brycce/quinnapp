import re

def create_phone_alias(phone: str | None) -> str:
    """Create a masked phone number for privacy.

    Examples:
        +1234567890 -> ***-***-7890
        (123) 456-7890 -> ***-***-7890
    """
    if not phone:
        return "Unknown"

    # Extract only digits
    digits = re.sub(r'\D', '', phone)

    # Get last 4 digits
    if len(digits) >= 4:
        last_four = digits[-4:]
        return f"***-***-{last_four}"

    return "***-***-****"
