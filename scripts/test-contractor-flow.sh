#!/bin/bash

# Test script for the contractor follow-up loop
# This creates real test data and sends real SMS

# Configuration - hardcoded for convenience
API_BASE="https://callquinn.ai"
SUPABASE_URL="https://fsydcxbrhogsonmrrxmg.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzeWRjeGJyaG9nc29ubXJyeG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MDg4NTEsImV4cCI6MjA4MDM4NDg1MX0.dUvDvJg5uEuhSp4heKiOHOpdeFXcJlIz7xYTcNfBs9o"
TEST_PHONE="${TEST_PHONE:-}"  # Your real phone number in E.164 format

if [ -z "$TEST_PHONE" ]; then
  echo "Error: Set TEST_PHONE to your real phone number (e.g., +12505551234)"
  echo "Usage: TEST_PHONE=+12505551234 ./scripts/test-contractor-flow.sh"
  exit 1
fi

echo "=== Contractor Follow-up Loop Test ==="
echo "Using phone: $TEST_PHONE"
echo ""

# Step 1: Create a test service request
echo "Step 1: Creating test service request..."
SERVICE_REQUEST=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/service_requests" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"caller_name\": \"Test User\",
    \"caller_phone\": \"${TEST_PHONE}\",
    \"service_type\": \"plumbing\",
    \"description\": \"Leaky faucet in kitchen\",
    \"location\": \"123 Test St, Victoria BC\",
    \"status\": \"in_progress\",
    \"additional_context\": []
  }")

SERVICE_REQUEST_ID=$(echo "$SERVICE_REQUEST" | python3 -c "import sys, json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)

if [ -z "$SERVICE_REQUEST_ID" ]; then
  echo "Error creating service request:"
  echo "$SERVICE_REQUEST"
  exit 1
fi

echo "Created service request: $SERVICE_REQUEST_ID"
echo ""

# Step 2: Create a tracking token for this request
TRACKING_TOKEN="test-$(date +%s)"
echo "Using tracking token: $TRACKING_TOKEN"
echo ""

# Step 3: Create quote submission to link tracking token
echo "Step 2: Creating quote submission with tracking token..."
QUOTE_SUB=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/quote_submissions" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"service_request_id\": \"${SERVICE_REQUEST_ID}\",
    \"tracking_token\": \"${TRACKING_TOKEN}\",
    \"status\": \"pending\"
  }")

echo "Created quote submission"
echo ""

# Step 4: Simulate contractor email with a question
echo "Step 3: Simulating contractor email with question..."
EMAIL_RESPONSE=$(curl -s -X POST "${API_BASE}/api/inbound-email" \
  -H "Content-Type: application/json" \
  -d "{
    \"sender\": \"testcontractor@example.com\",
    \"recipient\": \"${TRACKING_TOKEN}@quotes.callquinn.com\",
    \"subject\": \"Re: Service Request\",
    \"stripped-text\": \"Hi, I can help with your leaky faucet. Can you tell me what brand the faucet is and approximately how old it is?\",
    \"Message-Id\": \"<test-$(date +%s)@mail.example.com>\",
    \"timestamp\": \"$(date +%s)\"
  }")

echo "Email response:"
echo "$EMAIL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$EMAIL_RESPONSE"
echo ""

echo "=== Test Started ==="
echo ""
echo "You should receive an SMS at $TEST_PHONE asking the contractor's question."
echo ""
echo "Reply to the SMS with an answer (e.g., 'It's a Moen faucet, about 5 years old')"
echo ""
echo "Then check the results:"
echo "  1. additional_context in service_requests table"
echo "  2. pending_questions table status"
echo "  3. Your email inbox at testcontractor@example.com (or Mailgun logs)"
echo ""
echo "Service Request ID: $SERVICE_REQUEST_ID"
echo "Tracking Token: $TRACKING_TOKEN"
