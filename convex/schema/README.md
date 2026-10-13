# Convex Schema Structure

This folder contains the modularized schema definitions for the oschat application.

## Structure

### Core Entities

- `user.ts` - User profile and preferences
- `chat.ts` - Chat sessions/conversations
- `message.ts` - Individual messages within chats

### Message Parts System

- `parts.ts` - Defines different types of message content:
  - `TextPart` - Plain text content
  - `ImagePart` - Image attachments
  - `ReasoningPart` - AI reasoning/thinking steps
  - `FilePart` - File attachments
  - `ErrorUIPart` - Error messages
  - `ToolInvocationUIPart` - Tool/function calling UI

### Supporting Entities

- `chat_attachment.ts` - File attachments for chats
- `feedback.ts` - User feedback
- `user_api_key.ts` - User's custom API keys
- `purchase.ts` - Payment records
- `order.ts` - Order management
- `logo.ts` - Logo customization

## Key Changes from Previous Schema

1. **Messages now support parts**: While keeping the `content` field for backward compatibility, messages can now have structured `parts` for rich content like images, files, and tool invocations.

2. **Modular structure**: Each entity is now in its own file for better organization and maintainability.

3. **Preserved threading**: The `parentMessageId` field is retained to support message threading.

4. **Chat-based (not thread-based)**: We're keeping the chat paradigm instead of switching to threads, maintaining consistency with the existing application structure.
