import sys
import io
# Avoid encoding errors on Windows when printing
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from services.chat_learning import index_conversation
from config import supabase

print("Listing all conversations...")
result = supabase.table("rag_conversations").select("id, title").execute()
conversations = result.data or []
print("Conversations found:", len(conversations))

for conv in conversations:
    print(f"\nAttempting to index conversation {conv['id']} ({conv['title']})...")
    try:
        res = index_conversation(conv['id'])
        print("Result:", res)
    except Exception as e:
        import traceback
        print("CRITICAL: Exception raised inside index_conversation!")
        print("Type:", type(e))
        print("Details (safe repr):", repr(e))
        traceback.print_exc(file=sys.stdout)
