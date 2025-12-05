# Custom system prompt extensions for Unmute
# You can add dynamic prompt generation here if needed

def get_dynamic_prompt(character_name: str) -> str:
    """
    Generate dynamic system prompts based on context
    This is called when the character is selected
    """

    # Example: Add current date/time context
    from datetime import datetime
    current_date = datetime.now().strftime("%B %d, %Y")

    if character_name == "Quinn" or character_name == "Quinn (Male)":
        return f"""
        Additional context for today ({current_date}):
        - Be aware of the current date when discussing timelines
        - If it's a weekend, be extra accommodating about scheduling
        - If it's near a holiday, mention potential scheduling impacts
        """

    return ""

# You can add more helper functions here for your specific use case
