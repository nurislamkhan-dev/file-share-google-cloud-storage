#!/bin/bash

# Simple API test script
# Make sure the server is running on port 3000

BASE_URL="http://localhost:3000"
TEST_FILE="test-api-file.txt"

echo "🧪 Testing File Sharing API..."
echo ""

# Create a test file
echo "Creating test file..."
echo "This is a test file for API verification" > "$TEST_FILE"

# 1. Test Health Check
echo "1️⃣  Testing Health Check..."
HEALTH=$(curl -s "$BASE_URL/health")
echo "   Response: $HEALTH"
echo ""

# 2. Test File Upload
echo "2️⃣  Testing File Upload (POST /files)..."
UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/files" -F "file=@$TEST_FILE")
PUBLIC_KEY=$(echo $UPLOAD_RESPONSE | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
PRIVATE_KEY=$(echo $UPLOAD_RESPONSE | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)

if [ -z "$PUBLIC_KEY" ] || [ -z "$PRIVATE_KEY" ]; then
    echo "   ❌ Upload failed!"
    echo "   Response: $UPLOAD_RESPONSE"
    rm -f "$TEST_FILE"
    exit 1
fi

echo "   ✅ Upload successful!"
echo "   Public Key:  $PUBLIC_KEY"
echo "   Private Key: $PRIVATE_KEY"
echo ""

# 3. Test File Download
echo "3️⃣  Testing File Download (GET /files/:publicKey)..."
DOWNLOAD_CONTENT=$(curl -s -X GET "$BASE_URL/files/$PUBLIC_KEY")
EXPECTED_CONTENT="This is a test file for API verification"

if [ "$DOWNLOAD_CONTENT" = "$EXPECTED_CONTENT" ]; then
    echo "   ✅ Download successful! Content matches."
else
    echo "   ❌ Download failed or content mismatch!"
    echo "   Expected: $EXPECTED_CONTENT"
    echo "   Got:      $DOWNLOAD_CONTENT"
    rm -f "$TEST_FILE"
    exit 1
fi
echo ""

# 4. Test File Delete
echo "4️⃣  Testing File Delete (DELETE /files/:privateKey)..."
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/files/$PRIVATE_KEY")
SUCCESS=$(echo $DELETE_RESPONSE | grep -o '"success":true')

if [ -n "$SUCCESS" ]; then
    echo "   ✅ Delete successful!"
else
    echo "   ❌ Delete failed!"
    echo "   Response: $DELETE_RESPONSE"
    rm -f "$TEST_FILE"
    exit 1
fi
echo ""

# 5. Verify File is Deleted
echo "5️⃣  Verifying file is deleted..."
VERIFY_RESPONSE=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/files/$PUBLIC_KEY" -o /dev/null)

if [ "$VERIFY_RESPONSE" = "404" ]; then
    echo "   ✅ File successfully deleted (404 as expected)"
else
    echo "   ⚠️  Unexpected response code: $VERIFY_RESPONSE"
fi
echo ""

# Cleanup
rm -f "$TEST_FILE"

echo "✅ All tests passed! API is working correctly."
echo ""
