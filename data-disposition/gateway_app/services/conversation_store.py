# gateway_app/services/conversation_store.py
from typing import Dict, List, Any
from collections import defaultdict

class ConversationStore:
    def __init__(self):
        self._threads: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    def get(self, conv_id: str) -> List[Dict[str, Any]]:
        return self._threads[conv_id]

    def append(self, conv_id: str, role: str, content: str):
        self._threads[conv_id].append({"role": role, "content": content})

    def extend(self, conv_id: str, messages):
        self._threads[conv_id].extend(messages)
