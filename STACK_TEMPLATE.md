---
id: example-stack
name: Example Stack
version: 1.0.0
description: Short description of what this stack does
author: Your Name
runtime: python  # python | node | shell
entrypoint: main.py
icon: "🔧"
category: utilities
tags: [example, template]

# Optional: secrets this stack needs
secrets:
  - key: API_KEY
    label: API Key
    required: false
    helpUrl: https://example.com/get-api-key
---

# Example Stack

Describe what this stack does and when to use it.

## Runtime

This stack requires **Python**. If not installed:
```bash
pstack install runtime:python
```

## Usage

```bash
pstack run stack:example-stack --input '{"param": "value"}'
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `param` | string | yes | Description of parameter |

## Example

```bash
pstack run stack:example-stack --input '{"param": "hello"}'
```

## Output

Describe what the stack outputs.
