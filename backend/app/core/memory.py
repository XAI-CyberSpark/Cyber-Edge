try:
    import chromadb
    from chromadb.utils import embedding_functions
except ImportError:
    chromadb = None  # type: ignore[assignment]
    embedding_functions = None  # type: ignore[assignment]
import logging
import time
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class MemoryService:
    def __init__(self, persist_directory: str = "./memory_db"):
        self.persist_directory = persist_directory

        if chromadb is None:
            logger.warning("chromadb not installed — MemoryService running in stub mode")
            self.client = None
            self.embedding_fn = None
            self.collection = None
            return

        # Initialize ChromaDB Client
        self.client = chromadb.PersistentClient(path=persist_directory)

        # Use SentenceTransformer embedding function (all-MiniLM-L6-v2)
        # This downloads a small model (~80MB) on first run
        # We explicitly set it to use CPU/NPU if possible
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )

        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name="cyber_edge_memory", embedding_function=self.embedding_fn
        )

        logger.info(f"Memory Service initialized at {persist_directory}")

    def add(self, text: str, metadata: Optional[Dict[str, Any]] = None):
        """Add a memory entry."""
        if self.collection is None:
            return False
        if not metadata:
            metadata = {}

        # Add timestamp
        metadata["timestamp"] = str(time.time())

        try:
            self.collection.add(
                documents=[text],
                metadatas=[metadata],
                ids=[str(time.time())],  # Simple unique ID
            )
            return True
        except Exception as e:
            logger.error(f"Failed to add memory: {e}")
            return False

    def query(self, query_text: str, n_results: int = 3) -> List[Dict[str, Any]]:
        """Retrieve relevant memories."""
        if self.collection is None:
            return []
        try:
            results = self.collection.query(
                query_texts=[query_text], n_results=n_results
            )

            # Format results
            memories = []
            if results["documents"]:
                for i, doc in enumerate(results["documents"][0]):
                    memories.append(
                        {
                            "content": doc,
                            "metadata": results["metadatas"][0][i]
                            if results["metadatas"]
                            else {},
                            "distance": results["distances"][0][i]
                            if results["distances"]
                            else 0,
                        }
                    )

            return memories
        except Exception as e:
            logger.error(f"Failed to query memory: {e}")
            return []
