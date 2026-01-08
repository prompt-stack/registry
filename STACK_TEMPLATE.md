---
id: example-stack
name: Example Stack
version: 1.0.0
description: Short description of what this stack does
runtime: python  # python | node | shell
command:
  - python3
  - python/src/server.py
provides:
  tools:
    - example_tool
requires:
  binaries:
    - ffmpeg
  secrets:
    - name: API_KEY
      label: API Key
      required: false
      link: https://example.com/get-api-key
meta:
  author: Your Name
  license: MIT
  category: utilities
  tags: [example, template]
  icon: "🔧"
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
