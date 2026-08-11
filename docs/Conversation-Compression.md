# Conversation Compression

Defines how context is preserved when an AI conversation (Claude chat, etc.) grows too long to continue in-place.

## When to Generate a Compression Report

When a chat approaches its context limit, or a department chat has grown large enough that continuity is at risk.

## Required Contents

A Conversation Compression Report must include:

- **Executive Summary**
- **Major Decisions** (with Decision IDs)
- **Decision IDs Created** this session
- **Documentation Updated**
- **Files Created**
- **Features Approved / Rejected**
- **Outstanding Questions**
- **Risks**
- **Next Sprint**
- **Required Documents** (what still needs to be read to have full context)

## Purpose

A brand-new conversation should be able to read the report and continue work with minimal loss of context. **Important company knowledge must never live only inside a conversation** — if it's important, it belongs in this repository (`docs/`, `Decision-Register.md`, or `sessions/`) before the conversation ends.
