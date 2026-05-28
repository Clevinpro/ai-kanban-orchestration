# AI Platform — Application Guide

## Overview

AI Platform is an intelligent assistant system that allows users to interact with a knowledge base through natural language. The platform combines document management, semantic search, and large language models to provide accurate, context-aware responses.

---

## What You Can Do

### Ask Questions

You can ask any question in natural language — in Ukrainian or English. The platform will search through the available knowledge base and generate a precise answer based on the most relevant documents.

Examples:

- "Hi, what can I learn here?"
- "What topics are covered in this knowledge base?"
- "How does this work?"
- "What should I ask you about?"

### Upload Documents

You can expand the knowledge base by uploading documentation files in `.md` or `.txt` format. Once uploaded, the platform automatically processes and indexes the content, making it available for future queries.

- Upload a `guide.md` file to update the main application description
- Upload any other `.md` or `.txt` file to add topic-specific documentation

### Maintain Conversations

The platform remembers the context of your conversation. You can ask follow-up questions without repeating context, and the assistant will maintain coherence across up to 10 previous messages.

Examples:

- "Tell me more about that"
- "How does it compare to the previous approach?"
- "Give me an example"

### Browse Uploaded Documentation

You can retrieve notes and summaries for each uploaded documentation file. This allows you to quickly review what knowledge is available in the system without re-reading full documents.

---

## How It Works

1. **You send a message** via the chat interface or API
2. **The platform searches** the knowledge base using semantic similarity (vector search)
3. **Relevant context** from matching documents is retrieved
4. **An AI model** (Claude or Ollama) generates a response using that context
5. **The response is streamed** back to you in real time

For capability questions like "what can I do?", the platform responds instantly from this guide without performing a full search.

---

## Supported File Types

| Format              | Supported |
| ------------------- | --------- |
| Markdown (`.md`)    | Yes       |
| Plain text (`.txt`) | Yes       |
| PDF, DOCX, etc.     | Not yet   |

---

## Authentication

Access to the platform requires a user account. You can sign in with:

- **Email and password** — standard credentials
- **Google OAuth** — one-click sign-in via your Google account

Sessions are managed with short-lived JWT access tokens (15 minutes) and long-lived refresh tokens (7 days).

---

## Technical Notes

- The knowledge base uses **pgvector** for high-performance semantic search
- Documents are split into chunks of ~500 characters with overlap for better retrieval accuracy
- The platform supports **Claude** (Anthropic) and **Ollama** (local) as AI providers, switchable via configuration
- All services communicate internally via **Kafka** for reliable, asynchronous processing

---

_This guide is automatically updated as new documentation is added to the system._
