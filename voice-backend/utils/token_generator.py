import secrets
import string

def generate_tracking_token(length: int = 12) -> str:
    """Generate a URL-safe tracking token.

    Returns a random alphanumeric string for use in tracking URLs.
    """
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))
