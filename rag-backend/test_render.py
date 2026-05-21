import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import requests

BASE = "https://contactcenter-1.onrender.com/api"

try:
    print("Testing Render Health Check...")
    r = requests.get(f"{BASE}/health").json()
    print("Render Health:", r)
except Exception as e:
    print("Render Health failed:", repr(e))

try:
    print("\nTesting Render Conversations list...")
    r = requests.get(f"{BASE}/conversations").json()
    print(f"Render Conversations count: {len(r.get('conversations', []))}")
except Exception as e:
    print("Render Conversations failed:", repr(e))

try:
    print("\nTesting Render Chat with simple question...")
    r = requests.post(f"{BASE}/chat", json={
        "question": "Hola, quien sos?",
        "conversation_id": None
    }, timeout=30)
    print("Render Chat status:", r.status_code)
    print("Render Chat response:", r.json())
except Exception as e:
    print("Render Chat failed:", repr(e))
