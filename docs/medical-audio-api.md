# Medical Audio Processing API

## Overview
New isolated module for doctor-patient audio upload and local Faster-Whisper based clinical processing.

Base path: `/api/medical`  
Auth: `Authorization: Bearer <access_token>`

## 1) Upload Audio
`POST /api/medical/audio-upload`

### Request
- `multipart/form-data`
- field: `audio` (`.wav`, `.mp3`, `.mpeg`, `.m4a`, `.webm`)

### Response
```json
{
  "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
  "status": "uploaded"
}
```

## 2) Check Status
`GET /api/medical/status/{id}`

### Response
```json
{
  "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
  "status": "stt_processing",
  "processing_status": "stt_processing",
  "upload_time": "2026-03-03T10:15:30.422Z",
  "filename": "1741000000000-uuid-consultation.mp3",
  "transcript_available": false,
  "report_available": false,
  "error": null
}
```

## 3) Get Transcript
`GET /api/medical/transcript/{id}`

### Response
```json
{
  "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
  "status": "analysis_processing",
  "transcript": [
    {
      "speaker": "Doctor",
      "text": "Please tell me about your symptoms.",
      "start_time": "00:00:02",
      "end_time": "00:00:05"
    },
    {
      "speaker": "Patient",
      "text": "I have had fever and headache since yesterday.",
      "start_time": "00:00:06",
      "end_time": "00:00:10"
    }
  ]
}
```

## 4) Get Report
`GET /api/medical/report/{id}`

Query params:
- `format=json|html` (default: `json`)
- `download=true|false` (default: `false`)

### JSON response
```json
{
  "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
  "status": "completed",
  "report": {
    "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
    "filename": "1741000000000-uuid-consultation.mp3",
    "generated_at": "2026-03-03T10:18:50.013Z",
    "sections": {
      "patient_summary": "Patient reported fever and headache.",
      "chief_complaints": ["fever", "headache"],
      "medical_discussion_summary": "Total conversation turns: 12. Doctor turns: 6. Patient turns: 6.",
      "observations": [],
      "diagnosis": ["viral infection"],
      "prescriptions": [
        { "name": "paracetamol", "dosage": "500 mg", "frequency": "twice daily" }
      ],
      "doctor_recommendations": ["rest well", "drink plenty of fluids"],
      "follow_up_plan": ["Follow-up in 3 days"],
      "full_transcript": []
    },
    "analysis": {
      "symptoms": ["fever", "headache"],
      "diagnosis": ["viral infection"],
      "medications": [
        { "name": "paracetamol", "dosage": "500 mg", "frequency": "twice daily" }
      ],
      "advice": ["rest well", "drink plenty of fluids"],
      "risk_flags": [],
      "follow_up": ["Follow-up in 3 days"]
    }
  }
}
```

## 5) Live Stream Channel
`GET /api/medical/transcript/{id}/stream?channel=medical-transcription`

Content type: `text/event-stream`

### Events
- `TRANSCRIPTION_STARTED`
- `TRANSCRIPTION_UPDATE`
- `TRANSCRIPTION_COMPLETED`

### Event payload examples
```json
{
  "channel": "medical-transcription",
  "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
  "status": "queued"
}
```

```json
{
  "channel": "medical-transcription",
  "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
  "status": "stt_processing",
  "progress": 42.86,
  "transcript_count": 6,
  "chunk": {
    "speaker": "Patient",
    "text": "I also feel dizzy in the morning.",
    "start_time": "00:00:16",
    "end_time": "00:00:20"
  }
}
```

```json
{
  "channel": "medical-transcription",
  "upload_id": "f013d78c-0a50-4a32-8afa-7163a2e0b8d8",
  "status": "completed",
  "transcript_count": 14,
  "report_ready": true
}
```

## Error format
```json
{
  "error": {
    "code": "UNSUPPORTED_FORMAT",
    "message": "Unsupported file format. Allowed formats: WAV, MP3, MPEG, M4A, WEBM.",
    "details": null
  }
}
```
