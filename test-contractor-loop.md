# Testing the Contractor Follow-up Loop (Real SMS)

This guide walks through manually testing the full contractor question → SMS → reply flow with real messages.

## Prerequisites

- Your app deployed to Vercel
- Mailgun configured for `quotes.callquinn.com`
- Twilio configured for SMS
- A real phone number to receive SMS

## Step 1: Create a Test Service Request

First, create a service request in Supabase with your real phone number:

```bash
# Replace with your actual phone number
curl -X POST "https://YOUR_SUPABASE_URL/rest/v1/service_requests" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "caller_name": "Test User",
    "caller_phone": "+12505551234",
    "service_type": "plumbing",
    "description": "Leaky faucet in kitchen",
    "location": "123 Test St, Victoria BC",
    "status": "in_progress",
    "additional_context": []
  }'
```

Save the returned `id` - you'll need it.

## Step 2: Simulate a Contractor Email with a Question

Send a POST request to the inbound email endpoint as if Mailgun received it:

```bash
curl -X POST "https://callquinn.ai/api/inbound-email" \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "contractor@example.com",
    "recipient": "YOUR_TRACKING_TOKEN@quotes.callquinn.com",
    "subject": "Re: Service Request",
    "stripped-text": "Hi, I would be happy to help with the leaky faucet. Can you tell me how old the faucet is and what brand it is?",
    "Message-Id": "<test-123@mail.example.com>",
    "timestamp": "1234567890"
  }'
```

**Note**: Replace `YOUR_TRACKING_TOKEN` with a tracking token associated with your service request. You can find this in the `quote_submissions` table.

## Step 3: Check Your Phone

You should receive an SMS asking the contractor's question:

> "Hey Test! One of the contractors asked: 'Can you tell me how old the faucet is and what brand it is?' - can you let me know?"

## Step 4: Reply via SMS

Text back with your answer, e.g.:

> "It's a Moen faucet, about 5 years old"

## Step 5: Verify the Flow

1. **Check `additional_context`** was updated:
   ```bash
   curl "https://YOUR_SUPABASE_URL/rest/v1/service_requests?id=eq.YOUR_REQUEST_ID" \
     -H "apikey: YOUR_ANON_KEY"
   ```

   Should show:
   ```json
   {
     "additional_context": [
       {
         "question": "Can you tell me how old the faucet is and what brand it is?",
         "answer": "It's a Moen faucet, about 5 years old",
         "source": "sms",
         "timestamp": "..."
       }
     ]
   }
   ```

2. **Check email was sent** to contractor (check the contractor email inbox or Mailgun logs)

3. **Check `pending_questions`** status is "replied":
   ```bash
   curl "https://YOUR_SUPABASE_URL/rest/v1/pending_questions?service_request_id=eq.YOUR_REQUEST_ID" \
     -H "apikey: YOUR_ANON_KEY"
   ```

---

## Alternative: Direct SMS Trigger Test

If you just want to test the SMS part works:

```bash
curl -X POST "https://callquinn.ai/api/trigger-question-sms" \
  -H "Content-Type: application/json" \
  -d '{
    "service_request_id": "YOUR_REQUEST_ID",
    "question": "What color is your bathroom?",
    "pending_question_id": null
  }'
```

This will send a real SMS to the phone number on that service request.

---

## Troubleshooting

### SMS not received
- Check Twilio logs in the console
- Verify phone number format is E.164 (+1...)
- Check the service request has the correct phone number

### Email not analyzed
- Check Vercel function logs for `inbound-email`
- Verify GROQ_API_KEY is set

### Reply not sent
- Check Vercel function logs for `reply-to-contractor`
- Verify MAILGUN_API_KEY is set
- Check Mailgun dashboard for delivery status
