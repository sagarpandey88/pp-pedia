export interface RawChunk {
  chunk_index: number;
  chunk_content: string;
  heading_context: string;
}

/**
 * Splits an oversized block (such as a large markdown table or code block without blank lines)
 * into smaller line-based segments that fit within maxChars.
 */
function splitOversizedBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];

  const lines = block.split('\n');
  const segments: string[] = [];
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > maxChars && current.length > 0) {
      segments.push(current.trim());
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current.trim().length > 0) {
    if (current.length > maxChars) {
      // Fallback for huge unbroken lines (e.g. long base64 or minified XML/JSON)
      for (let i = 0; i < current.length; i += maxChars) {
        segments.push(current.slice(i, i + maxChars));
      }
    } else {
      segments.push(current.trim());
    }
  }

  return segments;
}

/**
 * Splits a Markdown document into semantic chunks based on headings,
 * preserving heading hierarchy for context.
 */
export function chunkMarkdown(
  markdown: string,
  targetChunkChars = 1000,
  overlapChars = 100
): RawChunk[] {
  if (!markdown || !markdown.trim()) {
    return [];
  }

  const lines = markdown.split('\n');
  const sections: { headingHierarchy: string[]; content: string }[] = [];

  const currentHeadings: { level: number; text: string }[] = [];
  let currentBuffer: string[] = [];

  const flushBuffer = () => {
    if (currentBuffer.length > 0) {
      const content = currentBuffer.join('\n').trim();
      if (content.length > 0) {
        sections.push({
          headingHierarchy: currentHeadings.map((h) => h.text),
          content,
        });
      }
      currentBuffer = [];
    }
  };

  const headingRegex = /^(#{1,6})\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      flushBuffer();
      const level = match[1].length;
      const text = match[2].trim();

      // Pop headings that are at the same or deeper level
      while (
        currentHeadings.length > 0 &&
        currentHeadings[currentHeadings.length - 1].level >= level
      ) {
        currentHeadings.pop();
      }
      currentHeadings.push({ level, text });
      currentBuffer.push(line);
    } else {
      currentBuffer.push(line);
    }
  }

  flushBuffer();

  const chunks: RawChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const headingContext =
      section.headingHierarchy.length > 0
        ? section.headingHierarchy.join(' > ')
        : 'Overview';

    const text = section.content;

    if (text.length <= targetChunkChars) {
      chunks.push({
        chunk_index: chunkIndex++,
        chunk_content: text,
        heading_context: headingContext,
      });
    } else {
      // Split into paragraphs first, then break any oversized blocks (tables, code)
      const rawParagraphs = text.split(/\n\s*\n/);
      const paragraphs: string[] = [];
      for (const p of rawParagraphs) {
        const trimmed = p.trim();
        if (!trimmed) continue;
        if (trimmed.length > targetChunkChars) {
          paragraphs.push(...splitOversizedBlock(trimmed, targetChunkChars));
        } else {
          paragraphs.push(trimmed);
        }
      }

      let chunkText = '';

      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;

        if (
          chunkText.length + para.length > targetChunkChars &&
          chunkText.length > 0
        ) {
          chunks.push({
            chunk_index: chunkIndex++,
            chunk_content: chunkText.trim(),
            heading_context: headingContext,
          });

          // Retain overlap from end of current chunk
          const words = chunkText.trim().split(/\s+/);
          const overlapWords = words.slice(-Math.min(words.length, 25)).join(' ');
          chunkText = overlapWords + '\n\n' + para;
        } else {
          chunkText = chunkText ? `${chunkText}\n\n${para}` : para;
        }
      }

      if (chunkText.trim().length > 0) {
        chunks.push({
          chunk_index: chunkIndex++,
          chunk_content: chunkText.trim(),
          heading_context: headingContext,
        });
      }
    }
  }

  return chunks;
}

