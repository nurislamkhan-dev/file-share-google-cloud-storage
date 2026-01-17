# File Sharing API Server

A Node.js-based file sharing API server with support for local filesystem and Google Cloud Storage providers.

> 📋 **Implementation Status:** See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for detailed information about what was implemented, known limitations, and research results.

## Features

- **RESTful API** for file upload, download, and deletion
- **Multiple Storage Providers** - Local filesystem and Google Cloud Storage
- **Daily Usage Limiting** - Configurable upload/download limits per IP address
- **Automatic Cleanup** - Removes inactive files after a configurable period
- **Comprehensive Testing** - Unit tests and integration tests included

## Prerequisites

- Node.js LTS version (18.0.0 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory based on `.env.example`:

```env
PORT=3000
FOLDER=./storage
PROVIDER=local
CONFIG=./config/gcs-config.json
```

### Environment Variables

- `PORT` - Port number for the API server (default: 3000)
- `FOLDER` - Absolute path to the root folder for local storage (required for local provider)
- `PROVIDER` - Storage provider type: `local` or `google` (default: `local`)
- `CONFIG` - Absolute path to provider configuration file (required for google provider)

### Optional Environment Variables

- `UPLOAD_LIMIT` - Daily upload limit per IP in bytes (default: 100 MB)
- `DOWNLOAD_LIMIT` - Daily download limit per IP in bytes (default: 500 MB)
- `INACTIVITY_PERIOD_DAYS` - Days of inactivity before file cleanup (default: 30)
- `CLEANUP_INTERVAL_HOURS` - Hours between cleanup job runs (default: 24)

## Usage

### Start the Server

```bash
npm start
```

The server will start on the port specified in the `PORT` environment variable.

### Run Tests

```bash
npm test
```

## API Endpoints

> 📖 **Complete API Documentation:** See [API_ENDPOINTS.md](./API_ENDPOINTS.md) for detailed endpoint documentation with examples, error codes, and rate limiting information.

### POST /files

Upload a new file.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Form field named `file` containing the file to upload

**Response:**
```json
{
  "publicKey": "abc123...",
  "privateKey": "xyz789..."
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/files \
  -F "file=@example.txt"
```

### GET /files/:publicKey

Download an existing file.

**Request:**
- Method: `GET`
- URL Parameter: `publicKey` - The public key returned from upload

**Response:**
- Content-Type: MIME type of the file
- Body: File content as binary stream

**Example:**
```bash
curl -X GET http://localhost:3000/files/abc123... \
  -o downloaded-file.txt
```

### DELETE /files/:privateKey

Delete an existing file.

**Request:**
- Method: `DELETE`
- URL Parameter: `privateKey` - The private key returned from upload

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/files/xyz789...
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "provider": "local"
}
```

## Google Cloud Storage Provider

To use Google Cloud Storage as the storage provider:

1. Set `PROVIDER=google` in your `.env` file
2. Create a configuration file (e.g., `config/gcs-config.json`)

### Configuration File Format

The Google Cloud Storage configuration file supports two formats:

#### Format 1: Credentials as Object

```json
{
  "projectId": "your-gcp-project-id",
  "bucket": "your-bucket-name",
  "credentials": {
    "type": "service_account",
    "project_id": "your-gcp-project-id",
    "private_key_id": "your-private-key-id",
    "private_key": "-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n",
    "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
    "client_id": "your-client-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com"
  },
  "createBucketIfNotExists": false,
  "location": "US",
  "storageClass": "STANDARD",
  "filePrefix": "files/",
  "metadataPrefix": "metadata/"
}
```

#### Format 2: Credentials as File Path

```json
{
  "projectId": "your-gcp-project-id",
  "bucket": "your-bucket-name",
  "credentials": "/path/to/your/service-account-key.json",
  "createBucketIfNotExists": false,
  "location": "US",
  "storageClass": "STANDARD",
  "filePrefix": "files/",
  "metadataPrefix": "metadata/"
}
```

### Configuration Options

- `projectId` (required) - Google Cloud Project ID
- `bucket` (required) - Name of the Google Cloud Storage bucket
- `credentials` (required) - Service account credentials (object or file path)
- `createBucketIfNotExists` (optional) - Create bucket if it doesn't exist (default: `false`)
- `location` (optional) - Bucket location (default: `US`)
- `storageClass` (optional) - Storage class (default: `STANDARD`)
- `filePrefix` (optional) - Prefix for stored files (default: `files/`)
- `metadataPrefix` (optional) - Prefix for metadata files (default: `metadata/`)

## Architecture

The application follows a modular architecture:

- **Storage Layer** - Abstraction for different storage providers
- **API Layer** - Express.js routes for HTTP endpoints
- **Middleware** - Usage limiting and request processing
- **Jobs** - Background tasks (cleanup job)
- **Server** - Main application entry point

## Testing

The project includes comprehensive tests:

- **Unit Tests** - Test individual components in isolation
- **Integration Tests** - Test API endpoints end-to-end

Run tests with:
```bash
npm test
```

## Project Structure

```
.
├── src/
│   ├── server.js              # Main server entry point
│   ├── api/
│   │   └── files.js           # File API routes
│   ├── storage/
│   │   ├── StorageProvider.js           # Base storage interface
│   │   ├── LocalFileSystemProvider.js   # Local filesystem provider
│   │   ├── GoogleCloudStorageProvider.js # Google Cloud Storage provider
│   │   └── StorageFactory.js            # Provider factory
│   ├── middleware/
│   │   └── usageLimiter.js    # Usage limiting middleware
│   └── jobs/
│       └── cleanupJob.js      # Cleanup job
├── tests/
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
├── config/                    # Configuration examples
└── package.json
```

## License

ISC
