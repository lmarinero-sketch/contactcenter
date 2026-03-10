"""
Chunker — Splits text into semantic chunks with contextual enrichment
Uses LangChain for splitting + OpenAI for document summarization
"""
import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter
from config import CHUNK_SIZE, CHUNK_OVERLAP, openai_client, RERANK_MODEL


# Token counter using tiktoken (cl100k_base = GPT-4 tokenizer)
_encoding = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    """Count tokens in a text string."""
    return len(_encoding.encode(text))


def _generate_document_summary(text: str, filename: str) -> str:
    """
    Generate a concise summary of the document using OpenAI.
    Only reads first ~4000 chars to keep cost minimal (1 call per document).
    Returns a summary string that will be prepended to each chunk.
    """
    try:
        # Take first 4000 chars for summary (enough to understand the document)
        sample = text[:4000]

        response = openai_client.chat.completions.create(
            model=RERANK_MODEL,  # gpt-4o-mini — cheap and fast
            temperature=0,
            max_tokens=300,
            timeout=30,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generá un resumen conciso del documento en 2-3 oraciones. "
                        "Incluí: tipo de documento, tema principal, y datos clave. "
                        "Respondé SOLO el resumen, sin encabezados ni explicaciones."
                    )
                },
                {
                    "role": "user",
                    "content": f"Documento: {filename}\n\nContenido (extracto):\n{sample}"
                }
            ]
        )
        summary = response.choices[0].message.content.strip()
        print(f"Document summary generated: {summary[:100]}...")
        return summary
    except Exception as e:
        print(f"Document summary generation failed: {e}")
        return ""


def chunk_text(text: str, filename: str, file_type: str, file_size: int) -> list[dict]:
    """
    Split text into chunks with metadata and contextual enrichment.
    
    Process:
    1. Generate a document-level summary with OpenAI (1 API call)
    2. Split text into chunks using hierarchical separators
    3. Prepend document context to each chunk for better embeddings
    """
    # Step 1: Generate document summary for contextual enrichment
    doc_summary = _generate_document_summary(text, filename)

    # Step 2: Split text into chunks
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=[
            "\n\n\n",  # Major sections
            "\n\n",    # Paragraphs
            "\n",      # Lines
            ". ",      # Sentences
            "; ",      # Clauses
            ", ",      # Sub-clauses
            " ",       # Words
            "",        # Characters (last resort)
        ],
        length_function=len,
    )

    chunks = splitter.split_text(text)
    total = len(chunks)

    # Step 3: Build enriched chunks with contextual prefix
    context_prefix = f"[Documento: {filename}]"
    if doc_summary:
        context_prefix += f"\n[Resumen: {doc_summary}]"
    context_prefix += "\n\n"

    result = []
    for i, chunk_text_content in enumerate(chunks):
        # Prepend context to chunk content — this is what gets embedded
        enriched_content = f"{context_prefix}{chunk_text_content}"

        result.append({
            "content": enriched_content,
            "metadata": {
                "filename": filename,
                "file_type": file_type,
                "file_size": file_size,
                "chunk_index": i,
                "total_chunks": total,
                "token_count": count_tokens(enriched_content),
                "doc_summary": doc_summary,
            }
        })

    print(f"Chunked {filename}: {total} chunks, context enriched={'yes' if doc_summary else 'no'}")
    return result

