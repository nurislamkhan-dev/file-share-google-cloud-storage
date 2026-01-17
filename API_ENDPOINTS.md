# API Endpoints Reference

Complete list of all available API endpoints for the File Sharing API Server.

## Base URL
```
http://localhost:3000
```
(Change port if configured differently)

---

## 1. Health Check

**Endpoint:** `GET /health`

**Description:** Check if the server is running and get basic status information.

**Request:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-17T17:27:00.303Z",
  "provider": "local"
}
```

**Status Codes:**
- `200 OK` - Server is running

---

## 2. Upload File

**Endpoint:** `POST /files`

**Description:** Upload a new file to the server. Returns public and private keys for accessing the file.

**Request:**
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`
- **Body:** Form field named `file` containing the file to upload

**Example:**
```bash
curl -X POST http://localhost:3000/files \
  -F "file=@example.txt"
```

**Response:**
```json
{
  "publicKey": "0ac487a7de65ce33d26532221a4385410ddefe599a0997a11d1bc717901ea2bf",
  "privateKey": "dee4c5fb2b521a50b7ad047b84f2970ab82e456915a8e5a8eef9c82cd188f89c"
}
```

**Status Codes:**
- `201 Created` - File uploaded successfully
- `400 Bad Request` - No file provided in request
- `429 Too Many Requests` - Daily upload limit exceeded for this IP
- `500 Internal Server Error` - Upload failed

**Notes:**
- Maximum file size: 100 MB per file
- Daily upload limit per IP: 100 MB (configurable via `UPLOAD_LIMIT` env var)
- Save both keys - you'll need them to download/delete the file

---

## 3. Download File

**Endpoint:** `GET /files/:publicKey`

**Description:** Download an existing file using its public key.

**Request:**
- **Method:** `GET`
- **URL Parameter:** `publicKey` - The public key returned from upload endpoint

**Example:**
```bash
curl -X GET http://localhost:3000/files/0ac487a7de65ce33d26532221a4385410ddefe599a0997a11d1bc717901ea2bf \
  -o downloaded-file.txt
```

**Response:**
- **Content-Type:** MIME type of the original file (e.g., `text/plain`, `image/png`, `application/pdf`)
- **Content-Disposition:** `attachment; filename="original-filename.txt"`
- **Body:** File content as binary stream

**Status Codes:**
- `200 OK` - File downloaded successfully
- `400 Bad Request` - Invalid or empty public key
- `404 Not Found` - File does not exist
- `429 Too Many Requests` - Daily download limit exceeded for this IP
- `500 Internal Server Error` - Download failed

**Notes:**
- Daily download limit per IP: 500 MB (configurable via `DOWNLOAD_LIMIT` env var)
- The file's last accessed timestamp is updated automatically

---

## 4. Delete File

**Endpoint:** `DELETE /files/:privateKey`

**Description:** Delete an existing file using its private key.

**Request:**
- **Method:** `DELETE`
- **URL Parameter:** `privateKey` - The private key returned from upload endpoint

**Example:**
```bash
curl -X DELETE http://localhost:3000/files/dee4c5fb2b521a50b7ad047b84f2970ab82e456915a8e5a8eef9c82cd188f89c
```

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

**Status Codes:**
- `200 OK` - File deleted successfully
- `400 Bad Request` - Invalid or empty private key
- `404 Not Found` - File does not exist
- `500 Internal Server Error` - Delete failed

**Notes:**
- Only the private key can be used to delete files (security feature)
- Once deleted, the file cannot be recovered

---

## Complete Workflow Example

Here's a complete example of using all endpoints:

```bash
# 1. Check server health
curl http://localhost:3000/health

# 2. Upload a file
UPLOAD_RESPONSE=$(curl -X POST http://localhost:3000/files -F "file=@myfile.txt")
PUBLIC_KEY=$(echo $UPLOAD_RESPONSE | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
PRIVATE_KEY=$(echo $UPLOAD_RESPONSE | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)

echo "Public Key: $PUBLIC_KEY"
echo "Private Key: $PRIVATE_KEY"

# 3. Download the file
curl -X GET "http://localhost:3000/files/$PUBLIC_KEY" -o downloaded-file.txt

# 4. Delete the file
curl -X DELETE "http://localhost:3000/files/$PRIVATE_KEY"
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

### Common Error Types:
- `No file provided` - Upload request missing file
- `Invalid public key` - Public key is empty or invalid
- `Invalid private key` - Private key is empty or invalid
- `File not found` - Requested file does not exist
- `Upload limit exceeded` - Daily upload limit reached
- `Download limit exceeded` - Daily download limit reached
- `Upload failed` - Server error during upload
- `Download failed` - Server error during download
- `Delete failed` - Server error during deletion
- `Internal server error` - Unexpected server error

---

## Rate Limiting

The API implements daily usage limits per IP address:

- **Upload Limit:** 100 MB per day per IP (default, configurable)
- **Download Limit:** 500 MB per day per IP (default, configurable)

When a limit is exceeded, the API returns:
```json
{
  "error": "Upload limit exceeded",
  "message": "Daily upload limit of 100 MB exceeded for this IP address",
  "limit": 104857600,
  "used": 104857600
}
```

Status code: `429 Too Many Requests`

Limits reset daily at midnight (based on server timezone).

---

## File Cleanup

Files are automatically cleaned up if they haven't been accessed for:
- **Default:** 30 days (configurable via `INACTIVITY_PERIOD_DAYS` env var)

The cleanup job runs:
- **Default:** Every 24 hours (configurable via `CLEANUP_INTERVAL_HOURS` env var)

---

## Summary Table

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/health` | Health check | No |
| `POST` | `/files` | Upload file | No |
| `GET` | `/files/:publicKey` | Download file | No |
| `DELETE` | `/files/:privateKey` | Delete file | No |

---

## Testing

Use the provided test script to verify all endpoints:

```bash
./test-api.sh
```

Or run the full test suite:

```bash
npm test
```
